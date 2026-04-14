// ===============================================
// src/routes/brain.js
// Story 2.9 — Adaptive Response Tuning for ACA
// + Story 9.6 — Multilingual / Tenant-Aware Query Layer
// + Story 9.5 / 10.3 — Voice Studio Audio Integration
// + Story 9.X — Tenant-Aware Conversational TTS
// + Story 12.8.3 — Strict Tenant Isolation Hardening (JWT-tenant-only)
// ===============================================
const express = require("express");
const router = express.Router();
router.use(express.json()); // ✅ Ensure JSON body parsing for /brain routes

const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const pool = require("../db/pool");
const { synthesizeSpeech } = require("../../tts"); // ✅ TTS handler
const { getTenantRegion } = require("../brain/utils/tenantContext"); // ✅ Tenant region helper

// ✅ Story 12.8 — optional rate limiting utility
let rateLimitIP = null;
try {
  ({ rateLimitIP } = require("../brain/utils/rateLimiters"));
} catch (e) {}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log("🔥 Story 2.9 adaptive router executing");
console.log("🧪 12.8.3 ORCH brain.js active build=2026-02-24T03:40Z");

const LOG_PATH = path.join(__dirname, "..", "logs", "response_tuning.log");
try {
  const logDir = path.dirname(LOG_PATH);
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
} catch (e) {
  console.warn("⚠️ Log dir check failed:", e.message);
}

// ✅ Story 12.8 — basic abuse control on /brain/query (IP-based)
if (typeof rateLimitIP === "function") {
  router.use(
    "/query",
    rateLimitIP({
      windowMs: 60_000,
      max: parseInt(process.env.BRAIN_QUERY_MAX_PER_MIN || "30", 10),
      keyPrefix: "brain_q",
    })
  );
}

// ---------------------------------------------------------
// Story 12.8.3 — Strict tenant isolation helpers (minimal)
// - derive tenant_id ONLY from JWT (never from body/query)
// - demo tokens can be verified with DEMO_JWT_SECRET
// - demo tokens force tenant_id = DEMO_TENANT_ID (env)
// ---------------------------------------------------------
function safeHash(value) {
  try {
    return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
  } catch {
    return "hash_error";
  }
}

function extractToken(req) {
  // Authorization: Bearer ...
  const auth = req.headers["authorization"] || req.headers["Authorization"];
  if (auth && String(auth).startsWith("Bearer ")) {
    return String(auth).slice(7).trim();
  }

  return "";
}

function verifyJwtAnySecret(token) {
  if (!token) return null;

  // 1) Primary secret
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (e) {}

  // 2) Demo secret fallback (optional)
  try {
    if (process.env.DEMO_JWT_SECRET) {
      return jwt.verify(token, process.env.DEMO_JWT_SECRET);
    }
  } catch (e) {}

  return null;
}

function deriveTenantIdFromJwt(decoded) {
  if (!decoded) return null;

  const isDemo = decoded && (decoded.role === "demo" || decoded.demo === true);

  // Demo tokens force tenant_id to DEMO_TENANT_ID (secure default)
  if (isDemo) {
    const demoEnabled =
      String(process.env.DEMO_MODE_ENABLED || "").toLowerCase() === "true" ||
      String(process.env.DEMO_MODE_ENABLED || "") === "1";

    if (!demoEnabled) return null;

    const demoTenant =
      process.env.DEMO_TENANT_ID != null ? String(process.env.DEMO_TENANT_ID) : null;
    if (!demoTenant) return null;

    const n = Number(demoTenant);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  // Non-demo: require tenant_id (or business_id) in token
  const raw =
    decoded.tenant_id != null
      ? decoded.tenant_id
      : decoded.business_id != null
      ? decoded.business_id
      : decoded.tenantId != null
      ? decoded.tenantId
      : null;

  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

router.post("/query", async (req, res) => {
  console.log("🟡 Story 2.9 adaptive tuning layer active");

  // ✅ Defensive: handle missing req.body safely
  const body = req.body || {};
  const {
    tenant_id,   // ⚠️ will NOT be trusted (kept only for override detection)
    business_id, // ⚠️ will NOT be trusted (kept only for override detection)
    query,
    language = "en-US",
    top_k = 3,
  } = body;

  // ✅ Secure validation caps
  const q = String(query || "").trim();
  const lang = String(language || "en-US").trim();
  const topK = Math.max(1, Math.min(parseInt(String(top_k || 3), 10) || 3, 5));

  if (!q) {
    return res.status(400).json({ ok: false, error: "query required" });
  }
  if (q.length > 2000) {
    return res.status(413).json({ ok: false, error: "query_too_large" });
  }
  if (lang.length > 24) {
    return res.status(400).json({ ok: false, error: "invalid_language" });
  }

  // ---------------------------------------------------------
  // Story 12.8.3 — AUTH + TENANT ISOLATION (fail closed)
  // ---------------------------------------------------------
  const token = extractToken(req);
  const decoded = verifyJwtAnySecret(token);

  if (!decoded) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  const resolvedId = deriveTenantIdFromJwt(decoded);
  if (!resolvedId) {
    return res.status(403).json({ ok: false, error: "tenant_required" });
  }

  // If client tries to override tenant in body, reject
  const bodyTenant =
    tenant_id != null
      ? Number(tenant_id)
      : business_id != null
      ? Number(business_id)
      : null;

  if (bodyTenant && Number.isFinite(bodyTenant) && bodyTenant !== resolvedId) {
    console.warn("⚠️ /brain/query tenant override blocked:", {
      token_tenant: resolvedId,
      body_tenant: bodyTenant,
      q_len: q.length,
    });
    return res.status(403).json({ ok: false, error: "tenant_mismatch" });
  }

  try {
    // 1️⃣ Create embedding for the incoming query
    const emb = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: q,
    });
    const vector = emb.data[0].embedding;
    const vectorLiteral = "[" + vector.join(",") + "]";

    // 2️⃣ Query Postgres using cosine distance (tenant-scoped)
    const result = await pool.query(
      `
      SELECT id, query_text AS question, answer,
             1 - (embedding <=> $1::vector) AS similarity
        FROM kb_entries
       WHERE tenant_id = $2
    ORDER BY embedding <=> $1::vector
       LIMIT $3;
      `,
      [vectorLiteral, resolvedId, topK]
    );

    const rows = result.rows;
    let tunedResponse = null;
    let confidence = 0;

    if (rows.length > 0) {
      const top = rows[0];
      confidence = parseFloat(top.similarity || 0).toFixed(2);
      tunedResponse = top.answer;

      if (confidence < 0.88) {
        const adaptivePrompt = `
Caller asked: "${q}"
Language: ${lang}
Closest KB answer (candidate): "${top.answer}"
Similarity score: ${confidence}

Rewrite this answer naturally for a ${lang} phone conversation.
Be friendly and concise. If unsure, add something like
"I believe so" or "Let me confirm that for you."
`;
        try {
          const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content:
                  "You are a polite multilingual voice AI assistant for a business call center.",
              },
              { role: "user", content: adaptivePrompt },
            ],
            max_tokens: 120,
            temperature: 0.8,
          });

          tunedResponse =
            completion.choices?.[0]?.message?.content?.trim() || top.answer;
        } catch (gptErr) {
          console.error("⚠️ Adaptive GPT error:", gptErr.message);
        }
      }
    } else {
      tunedResponse =
        "I’m not sure about that. Would you like me to connect you with someone from our team?";
    }

    // ✅ Minimal safe logging (no raw query/response persisted)
    await logAdaptiveResponse(q, tunedResponse, confidence, resolvedId, lang);

    // ✅ 3️⃣ Voice Studio / TTS integration block (tenant + region aware)
    let audioBase64 = null;
    try {
      let regionCode = null;
      try {
        regionCode = await getTenantRegion(resolvedId);
      } catch (regionErr) {
        console.warn(
          `⚠️ [brain] Failed to resolve tenant region for tenant=${resolvedId}:`,
          regionErr.message
        );
      }

      const audioBuffer = await synthesizeSpeech(tunedResponse, lang, {
        tenantId: resolvedId,
        regionCode,
        tonePreset: "friendly",
        useFillers: true,
      });

      if (audioBuffer) {
        audioBase64 = audioBuffer.toString("base64");
      }
    } catch (ttsErr) {
      console.error("⚠️ TTS synthesis failed:", ttsErr.message);
    }

    // 4️⃣ Send response (text + optional audio)
    res.json({
      ok: true,
      tenant_id: resolvedId, // ✅ always JWT-derived
      language: lang,
      confidence,
      tuned_response: tunedResponse,
      audio: audioBase64,
      matches: rows,
    });
  } catch (err) {
    console.error("❌ /brain/query failed:", err.message);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

async function logAdaptiveResponse(query, response, confidence, id, lang) {
  try {
    const q = typeof query === "string" ? query : String(query || "");
    const r = typeof response === "string" ? response : String(response || "");

    const logEntry =
      `[${new Date().toISOString()}] tenant=${id} lang=${lang} confidence=${confidence}` +
      ` q_len=${q.length} r_len=${r.length}` +
      ` q_hash=${safeHash(q)} r_hash=${safeHash(r)}\n`;

    await fs.promises.appendFile(LOG_PATH, logEntry, { encoding: "utf8" });
  } catch (err) {
    console.error("⚠️ Log write failed:", err.message);
  }
}

module.exports = router;