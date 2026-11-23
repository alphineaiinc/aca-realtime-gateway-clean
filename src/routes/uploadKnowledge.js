// src/routes/uploadKnowledge.js
const express = require("express");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const { PDFParse } = require("pdf-parse");
const pool = require("../db/pool");
const { embedText } = require("../brain/utils/embeddingManager");
const { createPostgresRateLimiter } = require("../middleware/postgresRateLimit");

const router = express.Router();

// ---------------------------------------------------------------------------
// Keep uploaded PDF bytes in memory; never resolve an uploaded path for filesystem access.
// ---------------------------------------------------------------------------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0, parts: 2 },
});

// ---------------------------------------------------------------------------
// Middleware: verify JWT
// ---------------------------------------------------------------------------
function authenticate(req, res, next) {
  try {
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded || !decoded.tenant_id) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
    req.tenant_id = decoded.tenant_id;
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
}

// ---------------------------------------------------------------------------
// Helper: split text into ~1000-char chunks
// ---------------------------------------------------------------------------
function chunkText(text, size = 1000) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

// Shared per-tenant request quota runs before multipart parsing and local capacity reservation.
// Requires the draft aca_rate_limit_buckets migration from coordinated PR #125.
const uploadRateLimit = createPostgresRateLimiter({ pool, scope: "knowledge-upload", windowMs: 60_000, max: 5 });

// ---------------------------------------------------------------------------
// POST /tenant/upload-knowledge  (JWT required)
// ---------------------------------------------------------------------------
let activeUploads = 0;
const activeTenants = new Set();
function reserveUpload(req, res, next) {
  const tenant = String(req.tenant_id);
  if (activeUploads >= 4 || activeTenants.has(tenant)) {
    return res.status(429).json({ ok: false, error: "Upload capacity reached" });
  }
  activeUploads++;
  activeTenants.add(tenant);
  let released = false;
  req.releaseUpload = () => {
    if (released) return;
    released = true;
    activeUploads--;
    activeTenants.delete(tenant);
  };
  // Release abandoned multipart requests, but retain capacity while processing.
  res.once?.("close", () => {
    if (!req.uploadProcessing) req.releaseUpload();
  });
  next();
}

function acceptPdfUpload(req, res, next) {
  upload.single("file")(req, res, (err) => {
    if (!err) {
      if (res.destroyed) { req.releaseUpload?.(); return; }
      req.uploadProcessing = true;
      return next();
    }
    req.releaseUpload?.();
    if (err instanceof multer.MulterError) {
      const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      return res.status(status).json({ ok: false, error: "Invalid upload" });
    }
    return res.status(400).json({ ok: false, error: "Invalid upload" });
  });
}

router.post("/tenant/upload-knowledge", authenticate, uploadRateLimit, reserveUpload, acceptPdfUpload, async (req, res) => {
  try {
  if (!req.file) {
    return res.status(400).json({ ok: false, error: "File missing" });
  }

  const originalName = String(req.file.originalname || "upload.pdf").slice(0, 255);
  const tenantId = req.tenant_id;

  try {
    // 1️⃣ Extract text from PDF
    const dataBuffer = req.file.buffer;
    if (!Buffer.isBuffer(dataBuffer) || dataBuffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
      return res.status(400).json({ ok: false, error: "Invalid PDF file" });
    }
    // pdf-parse v2 exposes PDFParse, not the legacy callable v1 API.
    const parser = new PDFParse({ data: dataBuffer });
    let text;
    try {
      const pdfData = await parser.getText();
      text = pdfData.text.trim();
    } finally {
      await parser.destroy();
    }
    if (!text) {
      return res.status(400).json({ ok: false, error: "PDF contains no extractable text" });
    }
    // Bound downstream embedding work independently of compressed PDF size.
    // Reject before issuing any embedding API calls or database writes.
    if (text.length > 100_000) {
      return res.status(413).json({ ok: false, error: "PDF text exceeds upload limit" });
    }

    // 2️⃣ Chunk + embed
    const chunks = chunkText(text);
    let inserted = 0;

    for (let i = 0; i < chunks.length; i++) {
      const content = chunks[i];

      // Get embedding array
      const embedding = await embedText(content);

      // ✅ Convert embedding array → valid pgvector literal
      const vectorLiteral = "[" + embedding.join(",") + "]";

      await pool.query(
        `INSERT INTO kb_entries (business_id, content, embedding, source_filename, chunk_index, created_at)
         VALUES ($1, $2, $3::vector, $4, $5, NOW())`,
        [tenantId, content, vectorLiteral, originalName, i]
      );

      inserted++;
    }

    return res.json({
      ok: true,
      message: "Knowledge uploaded successfully",
      filename: originalName,
      chunks: inserted,
    });
  } catch (err) {
    console.error("UploadKnowledge processing failed");
    return res.status(500).json({ ok: false, error: "Upload processing failed" });
  }
  } finally {
    req.releaseUpload?.();
  }
});

module.exports = router;
