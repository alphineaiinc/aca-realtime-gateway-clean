// src/routes/uploadKnowledge.js
const express = require("express");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");
const pool = require("../db/pool");
const { embedText } = require("../brain/utils/embeddingManager");

const router = express.Router();

// ---------------------------------------------------------------------------
// Multer setup: temporary store in /tmp (Render ephemeral FS safe)
// ---------------------------------------------------------------------------
const upload = multer({ dest: "/tmp" });

// ---------------------------------------------------------------------------
// Middleware: verify JWT
// ---------------------------------------------------------------------------
function authenticate(req, res, next) {
  try {
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
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

// ---------------------------------------------------------------------------
// POST /tenant/upload-knowledge  (JWT required)
// ---------------------------------------------------------------------------
router.post("/tenant/upload-knowledge", authenticate, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: "File missing" });

  const filePath = req.file.path;
  const originalName = req.file.originalname;
  const tenantId = req.tenant_id;

  try {
    // 1️⃣ Extract text from PDF
    const dataBuffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(dataBuffer);
    const text = pdfData.text.trim();
    if (!text) throw new Error("Empty PDF");

    // 2️⃣ Chunk + embed
    const chunks = chunkText(text);
    let inserted = 0;

    for (let i = 0; i < chunks.length; i++) {
      const content = chunks[i];
      const embedding = await embedText(content);

      await pool.query(
        `INSERT INTO kb_entries (business_id, content, embedding, source_filename, chunk_index, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [tenantId, content, embedding, originalName, i]
      );
      inserted++;
    }

    // 3️⃣ Cleanup
    fs.unlinkSync(filePath);
    return res.json({
      ok: true,
      message: "Knowledge uploaded successfully",
      filename: originalName,
      chunks: inserted
    });
  } catch (err) {
    console.error("UploadKnowledge error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
