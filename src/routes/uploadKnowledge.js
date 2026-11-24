// src/routes/uploadKnowledge.js
const express = require("express");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const { PDFParse } = require("pdf-parse");
const pool = require("../db/pool");
const { embedText } = require("../brain/utils/embeddingManager");

const router = express.Router();
const requestWindows = new Map();
function requestLimit(req,res,next) {
  const now=Date.now(),key=String(req.ip||"unknown");
  for(const [k,v] of requestWindows) if(v.until<=now) requestWindows.delete(k);
  let bucket=requestWindows.get(key);
  if(!bucket){if(requestWindows.size>=10000)return res.status(429).json({ok:false,error:"Upload rate limit reached"});bucket={count:0,until:now+60000};}
  if(bucket.count>=20)return res.status(429).json({ok:false,error:"Upload rate limit reached"});
  bucket.count++;requestWindows.set(key,bucket);next();
}

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
async function authenticate(req,res,next){
  try{
    const auth=req.headers.authorization||"";
    if(!auth.startsWith("Bearer "))throw Error();
    const claims=jwt.verify(auth.slice(7),process.env.JWT_SECRET,{algorithms:["HS256"],issuer:"alphine-ai",audience:"aca-business"});
    if(claims.purpose!=="verified_business"||!Number.isSafeInteger(claims.tenant_id)||claims.tenant_id<=0||typeof claims.sub!=="string")throw Error();
    const {rows}=await pool.query("SELECT tenant_id FROM public.aca_business_identities WHERE email=$1 AND tenant_id=$2 AND is_active",[claims.sub,claims.tenant_id]);
    if(rows.length!==1)throw Error();
    req.tenant_id=claims.tenant_id;
    next();
  }catch{return res.status(401).json({ok:false,error:"Unauthorized"});}
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
let activeUploads = 0;
const activeTenants = new Set();
const uploadWindows = new Map();
const WINDOW_MS = 60_000;
const MAX_UPLOADS_PER_WINDOW = 5;
const MAX_TRACKED_TENANTS = 10_000;
function reserveUpload(req, res, next) {
  const tenant = String(req.tenant_id);
  if (activeUploads >= 4 || activeTenants.has(tenant)) {
    return res.status(429).json({ ok: false, error: "Upload capacity reached" });
  }
  const now = Date.now();
  for (const [key, window] of uploadWindows) {
    if (window.expires <= now) uploadWindows.delete(key);
  }
  const window = uploadWindows.get(tenant) || { count: 0, expires: now + WINDOW_MS };
  if (window.count >= MAX_UPLOADS_PER_WINDOW ||
      (!uploadWindows.has(tenant) && uploadWindows.size >= MAX_TRACKED_TENANTS)) {
    return res.status(429).json({ ok: false, error: "Upload rate limit reached" });
  }
  window.count++;
  uploadWindows.set(tenant, window);
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

router.post("/tenant/upload-knowledge", requestLimit, authenticate, reserveUpload, acceptPdfUpload, async (req, res) => {
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
    const vectors = [];
    for (const content of chunks) {
      const embedding = await embedText(content);
      if (!Array.isArray(embedding) || !embedding.length || !embedding.every(Number.isFinite)) throw new Error("INVALID_EMBEDDING");
      vectors.push("[" + embedding.join(",") + "]");
    }
    // A single PostgreSQL statement is atomic: no partially ingested document.
    await pool.query(
      `INSERT INTO kb_entries (tenant_id, query_text, answer, embedding)
       SELECT $1, item.content, item.content, item.vector_text::vector
       FROM unnest($2::text[], $3::text[]) AS item(content, vector_text)`,
      [tenantId, chunks, vectors]
    );
    const inserted = chunks.length;

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
