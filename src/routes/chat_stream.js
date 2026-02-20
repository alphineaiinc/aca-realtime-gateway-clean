// src/routes/chat_stream.js
// Story 12.5 — SSE streaming chat endpoint with session memory + Render/proxy hardening
// Fixes:
// - Send 2KB padding immediately (defeats proxy buffering on Render)
// - Socket keep-alive + no-delay
// - Heartbeat comments every 10s
// - Preserve whitespace in streamed chunks (no trimming of payload)
// - Tenant-safe short-term memory prefix (no brain signature changes)

const express = require("express");
const jwt = require("jsonwebtoken");

// ✅ Use timeout-guarded brain wrapper (prevents hangs)
// retriever exports: { retrieveAnswer, retrieveAnswerWithTimeout }
const { retrieveAnswerWithTimeout: retrieveAnswer } = require("../../retriever");

// Memory (Story 12.7) — prefer new memory store; fallback to old if needed
let pushTurn, buildMemoryPrefix, clearSession;
try {
  // ✅ Story 12.7 canonical path
  ({ pushTurn, buildMemoryPrefix, clearSession } = require("../brain/memory/sessionMemory"));
  console.log("✅ [chat_stream] Using Story 12.7 memory store (src/brain/memory/sessionMemory.js)");
} catch (e) {
  // fallback (older path)
  ({ pushTurn, buildMemoryPrefix, clearSession } = require("../brain/utils/sessionMemory"));
  console.log("⚠️ [chat_stream] Falling back to legacy memory store (src/brain/utils/sessionMemory.js)");
}

const router = express.Router();

// ✅ Story 12.8 — cap JSON body size for this router (prevents abuse)
try {
  router.use(express.json({ limit: "64kb" }));
} catch (e) {}

const MAX_INCOMING_CHARS = 2000;
const HEARTBEAT_MS = 10_000;

// ------------------------------------------------------------------
// Story 12.8.1 — Public Demo Mode Architecture (SSE enforcement)
// - Align demo JWT verification with /api/demo/token (DEMO_JWT_SECRET + issuer/audience)
// - Force tenant_id = DEMO_TENANT_ID (if set)
// - Optional ip_hash binding if token + helper exist (do not require)
// - Add per-demo-token (jti) rate limiting without changing tenant logic
// ------------------------------------------------------------------
let demoConfig, getClientIp, hashIp;
try {
  ({ demoConfig } = require("../brain/utils/demoConfig"));
} catch (e) {}
try {
  ({ getClientIp, hashIp } = require("../db/demoGuards"));
} catch (e) {}

// ✅ Story 12.8 — generic in-memory rate limiter (IP-based)
let rateLimitIP = null;
try {
  ({ rateLimitIP } = require("../brain/utils/rateLimiters"));
} catch (e) {}

// Apply basic IP limiter to SSE endpoints (Render-safe, fail-open if limiter missing)
if (typeof rateLimitIP === "function") {
  router.use("/chat/stream", rateLimitIP({
    windowMs: parseInt(process.env.CHAT_STREAM_RATE_WINDOW_MS || "60000", 10),
    max: parseInt(process.env.CHAT_STREAM_RATE_MAX || "60", 10),
    keyPrefix: "sse_stream",
  }));

  router.use("/chat/session/clear", rateLimitIP({
    windowMs: parseInt(process.env.CHAT_CLEAR_RATE_WINDOW_MS || "60000", 10),
    max: parseInt(process.env.CHAT_CLEAR_RATE_MAX || "30", 10),
    keyPrefix: "sse_clear",
  }));
}

const DEMO_TOKEN_RATE_WINDOW_MS = parseInt(process.env.DEMO_TOKEN_RATE_WINDOW_MS || "60000", 10); // 60s
const DEMO_TOKEN_RATE_MAX_MSGS_DEFAULT = 60;

// demo_jti -> { count, resetAt }
const demoTokenRate = new Map();

function nowMs() {
  return Date.now();
}

function isProd() {
  return String(process.env.NODE_ENV || "").toLowerCase() === "production";
}

function getDemoTokenMaxMsgs() {
  try {
    const cfg = (typeof demoConfig === "function") ? demoConfig() : null;
    const n = cfg && typeof cfg.perMinToken === "number" ? cfg.perMinToken : null;
    if (n && Number.isFinite(n) && n > 0) return Math.floor(n);
  } catch (e) {}
  return DEMO_TOKEN_RATE_MAX_MSGS_DEFAULT;
}

function rateLimitDemoToken(demo_jti) {
  const key = String(demo_jti || "");
  if (!key) return true;

  const now = nowMs();
  const maxMsgs = getDemoTokenMaxMsgs();

  const bucket = demoTokenRate.get(key) || { count: 0, resetAt: now + DEMO_TOKEN_RATE_WINDOW_MS };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + DEMO_TOKEN_RATE_WINDOW_MS;
  }
  bucket.count += 1;
  demoTokenRate.set(key, bucket);

  return bucket.count <= maxMsgs;
}

// ✅ Story 12.8 — locale sanitization (prevent insane input; keep behavior minimal)
function normalizeLocale(x) {
  const s = String(x || "en-US").trim();
  if (!s) return "en-US";
  if (s.length > 24) return "en-US";
  // allow basic BCP-47-ish
  if (!/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(s)) return "en-US";
  return s;
}

// ---------------------------------------------------------------------------
// Middleware: verify JWT (tenant-safe)
// ✅ Story 12.8 — accept either:
//   - standard tokens signed with JWT_SECRET
//   - demo tokens signed with DEMO_JWT_SECRET (issuer/audience)
// ---------------------------------------------------------------------------
function authenticate(req, res, next) {
  try {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return res.status(401).json({ ok: false, error: "Unauthorized" });

    let decoded = null;

    // 1) Try normal JWT_SECRET first (existing behavior)
    try {
      if (process.env.JWT_SECRET) {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
      }
    } catch (e) {
      decoded = null;
    }

    // 2) If not verified, try DEMO_JWT_SECRET with issuer/audience
    if (!decoded) {
      try {
        const demoSecret = String(process.env.DEMO_JWT_SECRET || "").trim();
        if (demoSecret) {
          const issuer = String(process.env.JWT_ISSUER || "alphine-ai").trim();
          const audience = String(process.env.JWT_AUDIENCE || "aca-demo").trim();
          decoded = jwt.verify(token, demoSecret, { issuer, audience });
        }
      } catch (e) {
        decoded = null;
      }
    }

    if (!decoded) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    // default identity
    req.tenant_id = decoded.tenant_id;
    req.partner_id = decoded.partner_id;
    req.role = decoded.role;

    // ------------------------------------------------------------------
    // ✅ Story 12.8 — demo enforcement (aligned with /api/demo/token)
    // ------------------------------------------------------------------
    const isDemo = (decoded && (decoded.role === "demo" || decoded.demo === true));
    if (isDemo) {
      // Secure default: demo is only valid if DEMO_JWT_SECRET exists
      const demoSecret = String(process.env.DEMO_JWT_SECRET || "").trim();
      if (!demoSecret) {
        return res.status(401).json({ ok: false, error: "Unauthorized" });
      }

      // Optional config (if demoConfig exists)
      const cfg = (typeof demoConfig === "function") ? demoConfig() : null;

      // If demoConfig exists and says disabled, enforce it. Otherwise, allow (env gating already exists).
      if (cfg && cfg.enabled === false) {
        return res.status(401).json({ ok: false, error: "Unauthorized" });
      }

      // Optional ip_hash binding (ONLY if token has ip_hash AND helper exists)
      // We do NOT require it because /api/demo/token may not mint ip_hash today.
      try {
        if (decoded.ip_hash && typeof getClientIp === "function" && typeof hashIp === "function") {
          const ip = getClientIp(req);
          const expected = hashIp(ip);
          if (decoded.ip_hash !== expected) {
            return res.status(401).json({ ok: false, error: "Unauthorized" });
          }
        }
      } catch (e) {}

      // Force demo tenant if configured by env
      const envDemoTenant = parseInt(process.env.DEMO_TENANT_ID || "0", 10);
      const forcedTenant = (envDemoTenant && envDemoTenant > 0)
        ? envDemoTenant
        : (cfg && cfg.tenantId ? cfg.tenantId : null);

      req.tenant_id = forcedTenant || decoded.tenant_id;
      req.partner_id = null;
      req.role = "demo";
      req.demo_jti = decoded.demo_jti || decoded.jti || null;

      if (!req.tenant_id) {
        return res.status(401).json({ ok: false, error: "Unauthorized" });
      }

      return next();
    }

    if (!req.tenant_id) {
      return res.status(401).json({ ok: false, error: "Unauthorized (no tenant_id)" });
    }
    next();
  } catch (err) {
    // ✅ Safe debug (no token, no secret values)
    console.warn("🔐 [chat_stream] JWT verify failed:", err?.message || err);
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
}

// ---------------------------------------------------------------------------
// Helper: SSE write (safe single-line payload)
// NOTE: Keep standard SSE formatting: "event: X" + "data: Y" + blank line.
// We replace newlines with \n and rehydrate on client.
// ---------------------------------------------------------------------------
function sseEvent(res, eventName, data) {
  if (res.writableEnded) return;

  const safe = String(data ?? "").replace(/\r?\n/g, "\\n");
  res.write(`event: ${String(eventName)}\n`);
  res.write(`data: ${safe}\n\n`);
}

// ---------------------------------------------------------------------------
// Proxy-buffer buster: send a big comment block immediately (~2KB)
// This is the Render-safe trick that makes the browser receive bytes instantly.
// ---------------------------------------------------------------------------
function sseKickstart(res) {
  // comment lines begin with ":" per SSE spec and are ignored by the client parser
  // 2048+ bytes tends to defeat buffering proxies
  const pad = " ".repeat(2048);
  res.write(`: kickstart${pad}\n\n`);
}

// Chunker (keep simple; whitespace preserved because we do NOT trim chunks)
function* chunkText(text, chunkSize = 18) {
  const t = String(text || "");
  for (let i = 0; i < t.length; i += chunkSize) {
    yield t.slice(i, i + chunkSize);
  }
}

// ---------------------------------------------------------------------------
// POST /api/chat/session/clear
// ---------------------------------------------------------------------------
router.post("/chat/session/clear", authenticate, (req, res) => {
  try {
    const tenant_id = req.tenant_id;
    const session_id = (req.body && req.body.session_id) ? String(req.body.session_id) : "web";

    // ✅ Story 12.8 — cap session_id length (prevent abuse)
    const sid = session_id.length > 128 ? session_id.slice(0, 128) : session_id;

    clearSession(tenant_id, sid);
    console.log(`[chat_stream] session cleared tenant=${tenant_id} session=${sid}`);
    return res.json({ ok: true, cleared: true, tenant_id, session_id: sid });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "Failed to clear session" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/chat/stream
// ---------------------------------------------------------------------------
router.post("/chat/stream", authenticate, async (req, res) => {
  const tenant_id = req.tenant_id;

  // SSE headers (anti-buffer)
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Vary", "Accept-Encoding");

  // Socket hardening (helps on some platforms)
  try {
    if (res.socket) {
      res.socket.setTimeout(0);
      res.socket.setNoDelay(true);
      res.socket.setKeepAlive(true, 60_000);
    }
  } catch (e) {}

  if (typeof res.flushHeaders === "function") res.flushHeaders();

  const reqId = `sse_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  let clientClosed = false;

  // ✅ IMPORTANT: for SSE POST, use aborted/close on RESPONSE, not req.close()
  req.on("aborted", () => {
    clientClosed = true;
  });

  res.on("close", () => {
    clientClosed = true;
  });

  // ✅ MUST: kickstart immediately so client receives bytes and won’t abort
  sseKickstart(res);

  // Also send an early “connected” event so UI can flip from "connecting" to "thinking"
  sseEvent(res, "connected", "ok");

  // Heartbeat comments (keep proxies happy while retrieveAnswer runs)
  const heartbeat = setInterval(() => {
    if (clientClosed || res.writableEnded) return;
    try {
      res.write(`: ping ${Date.now()}\n\n`);
    } catch (e) {}
  }, HEARTBEAT_MS);

  try {
    // ✅ Story 12.8.1: additional per-demo-token rate limit (jti-based)
    if (req.role === "demo" && req.demo_jti) {
      if (!rateLimitDemoToken(req.demo_jti)) {
        sseEvent(res, "error", "Rate limited (demo token)");
        sseEvent(res, "done", "");
        clearInterval(heartbeat);
        return res.end();
      }
    }

    const messageRaw = (req.body && req.body.message) ? String(req.body.message) : "";
    const session_id_raw = (req.body && req.body.session_id) ? String(req.body.session_id) : "web";
    const locale_raw = (req.body && req.body.locale) ? String(req.body.locale) : "en-US";

    // ✅ Story 12.8 — cap session_id length
    const session_id = session_id_raw.length > 128 ? session_id_raw.slice(0, 128) : session_id_raw;

    // ✅ Story 12.8 — sanitize locale
    const locale = normalizeLocale(locale_raw);

    console.log(`[chat_stream] start ${reqId} tenant=${tenant_id} session=${session_id} locale=${locale}`);

    const message = messageRaw.trim();
    if (!message) {
      sseEvent(res, "error", "Empty message");
      sseEvent(res, "done", "");
      clearInterval(heartbeat);
      return res.end();
    }

    if (message.length > MAX_INCOMING_CHARS) {
      sseEvent(res, "error", `Message too long (max ${MAX_INCOMING_CHARS} chars)`);
      sseEvent(res, "done", "");
      clearInterval(heartbeat);
      return res.end();
    }

    // Store user turn (Story 12.7 store)
    try {
      pushTurn(tenant_id, session_id, "user", message);
    } catch (e) {
      console.warn("⚠️ [chat_stream] pushTurn failed:", e?.message || e);
    }

    // Tell client we started processing
    sseEvent(res, "start", "");

    // Memory prefix (no brain signature changes)
    let prefix = "";
    try {
      prefix = buildMemoryPrefix(tenant_id, session_id) || "";
    } catch (e) {
      console.warn("⚠️ [chat_stream] buildMemoryPrefix failed:", e?.message || e);
      prefix = "";
    }
    const brainInput = prefix + message;

   // ✅ Story 12.8 — Guard retriever availability
if (typeof retrieveAnswer !== "function") {
  sseEvent(res, "error", "Server misconfig: retriever not available");
  sseEvent(res, "done", "");
  console.warn("[chat_stream] retriever missing: expected retrieveAnswerWithTimeout or retrieveAnswer export");
  clearInterval(heartbeat);
  return res.end();
}

// ✅ FIX: retriever signature is (userQuery, tenantId, langCode, sessionId)
const result = await retrieveAnswer(brainInput, tenant_id, locale, session_id);


    if (clientClosed || res.writableEnded) {
      console.log(`[chat_stream] client closed early ${reqId} tenant=${tenant_id} session=${session_id}`);
      clearInterval(heartbeat);
      return res.end();
    }

    const reply =
      (typeof result === "string") ? result :
      (result && typeof result.reply === "string") ? result.reply :
      (result && typeof result.answer === "string") ? result.answer :
      (result && result.data && typeof result.data.reply === "string") ? result.data.reply :
      JSON.stringify(result);

    // Stream tokens
    for (const chunk of chunkText(reply, 18)) {
      if (clientClosed || res.writableEnded) break;
      sseEvent(res, "token", chunk);
      await new Promise(r => setTimeout(r, 15));
    }

    if (!clientClosed && !res.writableEnded) {
      sseEvent(res, "done", "");
    }

    // Store assistant turn (Story 12.7 store)
    try {
      pushTurn(tenant_id, session_id, "assistant", reply);
    } catch (e) {
      console.warn("⚠️ [chat_stream] pushTurn(assistant) failed:", e?.message || e);
    }

    console.log(`[chat_stream] done ${reqId} tenant=${tenant_id} session=${session_id}`);

    clearInterval(heartbeat);
    return res.end();
  } catch (err) {
    console.log(`[chat_stream] error ${reqId} tenant=${tenant_id} msg=${err?.message || "unknown"}`);

    try {
      sseEvent(res, "error", err?.message || "Server error");
      sseEvent(res, "done", "");
    } catch (e) {}

    clearInterval(heartbeat);
    return res.end();
  }
});

module.exports = router;
