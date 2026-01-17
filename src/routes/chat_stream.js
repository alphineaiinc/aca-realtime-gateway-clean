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

const MAX_INCOMING_CHARS = 2000;
const HEARTBEAT_MS = 10_000;

// ------------------------------------------------------------------
// Story 12.8.1 — Public Demo Mode Architecture (SSE enforcement)
// - If token role=demo or demo=true:
//   - require DEMO_MODE_ENABLED
//   - enforce ip_hash binding to client IP
//   - force tenant_id = DEMO_TENANT_ID
// - Add per-demo-token (jti) rate limiting without changing tenant logic
// ------------------------------------------------------------------
let demoConfig, getClientIp, hashIp;
try {
  ({ demoConfig } = require("../brain/utils/demoConfig"));
} catch (e) {}
try {
  ({ getClientIp, hashIp } = require("../db/demoGuards"));
} catch (e) {}

const DEMO_TOKEN_RATE_WINDOW_MS = parseInt(process.env.DEMO_TOKEN_RATE_WINDOW_MS || "60000", 10); // 60s
const DEMO_TOKEN_RATE_MAX_MSGS_DEFAULT = 60;

// demo_jti -> { count, resetAt }
const demoTokenRate = new Map();

function nowMs() {
  return Date.now();
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

// ---------------------------------------------------------------------------
// Middleware: verify JWT (tenant-safe)
// ---------------------------------------------------------------------------
function authenticate(req, res, next) {
  try {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // default identity
    req.tenant_id = decoded.tenant_id;
    req.partner_id = decoded.partner_id;
    req.role = decoded.role;

    // ------------------------------------------------------------------
    // ✅ Story 12.8.1 — demo enforcement
    // ------------------------------------------------------------------
    const isDemo = (decoded && (decoded.role === "demo" || decoded.demo === true));
    if (isDemo) {
      const cfg = (typeof demoConfig === "function") ? demoConfig() : null;

      if (!cfg || !cfg.enabled) {
        return res.status(401).json({ ok: false, error: "Unauthorized" });
      }

      if (typeof getClientIp !== "function" || typeof hashIp !== "function") {
        console.warn("🔐 [chat_stream] demo guards not available (getClientIp/hashIp missing)");
        return res.status(401).json({ ok: false, error: "Unauthorized" });
      }

      const ip = getClientIp(req);
      const expected = hashIp(ip);

      if (!decoded.ip_hash || decoded.ip_hash !== expected) {
        return res.status(401).json({ ok: false, error: "Unauthorized" });
      }

      // Force demo tenant + role
      req.tenant_id = cfg.tenantId;
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
    console.warn("🔐 [chat_stream] JWT_SECRET present?", !!process.env.JWT_SECRET);
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
    clearSession(tenant_id, session_id);
    console.log(`[chat_stream] session cleared tenant=${tenant_id} session=${session_id}`);
    return res.json({ ok: true, cleared: true, tenant_id, session_id });
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
    const session_id = (req.body && req.body.session_id) ? String(req.body.session_id) : "web";
    const locale = (req.body && req.body.locale) ? String(req.body.locale) : "en-US";

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
