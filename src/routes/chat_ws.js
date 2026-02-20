// src/routes/chat_ws.js
// Story 12.5 — Streaming Web Chat over WebSocket (Render-safe)
// Why: Render/Cloudflare proxy path can buffer/kill SSE streams. WebSockets are the reliable alternative.
//
// Protocol:
// Client connects to ws(s)://<host>/ws/chat
// Client sends: { type:"auth", token:"<JWT>", session_id:"...", locale:"en-US" }
// Then for each message: { type:"user", message:"..." }
// Server streams: { type:"token", data:"..." } ... then { type:"done" } or { type:"error", error:"..." }

const jwt = require("jsonwebtoken");

// ✅ Use timeout-guarded brain wrapper (fallback-safe)
const retriever = require("../../retriever");
const retrieveAnswer =
  (retriever && typeof retriever.retrieveAnswerWithTimeout === "function" && retriever.retrieveAnswerWithTimeout) ||
  (retriever && typeof retriever.retrieveAnswer === "function" && retriever.retrieveAnswer) ||
  null;


// Memory (Story 12.7) — prefer new memory store; fallback to old if needed
let pushTurn, buildMemoryPrefix, clearSession;
try {
  ({ pushTurn, buildMemoryPrefix, clearSession } = require("../brain/memory/sessionMemory"));
  console.log("✅ [chat_ws] Using Story 12.7 memory store (src/brain/memory/sessionMemory.js)");
} catch (e) {
  ({ pushTurn, buildMemoryPrefix, clearSession } = require("../brain/utils/sessionMemory"));
  console.log("⚠️ [chat_ws] Falling back to legacy memory store (src/brain/utils/sessionMemory.js)");
}

const MAX_INCOMING_CHARS = 2000;

// ------------------------------------------------------------------
// Story 12.6 — Web Chat Production Hardening Pack (WS-layer)
// - Per-tenant WS rate limiting
// - Max concurrent WS connections per tenant
// - Timeout guard for retrieveAnswer()
// - Safe audit logs (no raw message content)
// ------------------------------------------------------------------
const WS_MAX_CONN_PER_TENANT = parseInt(process.env.WS_MAX_CONN_PER_TENANT || "5", 10);
const WS_RATE_WINDOW_MS = parseInt(process.env.WS_RATE_WINDOW_MS || "10000", 10); // 10s
const WS_RATE_MAX_MSGS = parseInt(process.env.WS_RATE_MAX_MSGS || "30", 10); // per window

// ------------------------------------------------------------------
// Story 12.8.1 — Public Demo Mode Architecture (WS-layer add-on)
// - Align demo JWT verification with /api/demo/token (DEMO_JWT_SECRET + issuer/audience)
// - Force tenant_id = DEMO_TENANT_ID (if set)
// - Optional ip_hash binding if token + helper exist (do not require)
// - Per-demo-token (jti) rate limiting without changing tenant limiter
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

// tenant_id -> Set(connId)
const tenantConnSet = new Map();

// tenant_id -> { count, resetAt }
const tenantRateBucket = new Map();

function getTenantSet(tenantId) {
  const key = String(tenantId || "");
  if (!tenantConnSet.has(key)) tenantConnSet.set(key, new Set());
  return tenantConnSet.get(key);
}

function rateLimitTenant(tenantId) {
  const key = String(tenantId || "");
  const now = Date.now();
  const bucket = tenantRateBucket.get(key) || { count: 0, resetAt: now + WS_RATE_WINDOW_MS };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + WS_RATE_WINDOW_MS;
  }
  bucket.count += 1;
  tenantRateBucket.set(key, bucket);
  return bucket.count <= WS_RATE_MAX_MSGS;
}

function* chunkText(text, chunkSize = 18) {
  const t = String(text || "");
  for (let i = 0; i < t.length; i += chunkSize) {
    yield t.slice(i, i + chunkSize);
  }
}

function safeSend(ws, obj) {
  try {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
  } catch (e) {}
}

function parseJsonSafe(s) {
  try { return JSON.parse(s); } catch (e) { return null; }
}

// ✅ Story 12.8 — locale + session safeguards (minimal)
function normalizeLocale(x) {
  const s = String(x || "en-US").trim();
  if (!s) return "en-US";
  if (s.length > 24) return "en-US";
  if (!/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(s)) return "en-US";
  return s;
}

function normalizeSessionId(x) {
  const s = String(x || "web").trim();
  if (!s) return "web";
  return s.length > 128 ? s.slice(0, 128) : s;
}

// ✅ Story 12.8 — Verify JWT using either JWT_SECRET (normal) or DEMO_JWT_SECRET (demo)
function verifyAnyToken(tokenRaw) {
  const token = String(tokenRaw || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  // 1) normal
  try {
    if (process.env.JWT_SECRET) {
      return jwt.verify(token, process.env.JWT_SECRET);
    }
  } catch (e) {}

      // 2) demo (Story 12.8) — verify signature only (issuer/audience optional)
  try {
    const demoSecret = String(process.env.DEMO_JWT_SECRET || "").trim();
    if (demoSecret) {
      return jwt.verify(token, demoSecret);
    }
  } catch (e) {}


  return null;
}

function registerChatWs(app) {
  app.ws("/ws/chat", (ws, req) => {
    const connId = `ws_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    let authed = false;
    let tenant_id = null;
    let session_id = "web";
    let locale = "en-US";

    // Story 12.8.1: track demo token identity for per-token rate limiting
    let role = "unknown";
    let demo_jti = null;

    // ✅ Safe proof logs (no tokens, no raw message content)
    console.log(`[chat_ws] connected ${connId}`);
    console.log(`[chat_ws] /ws/chat WS CONNECT attempt ${new Date().toISOString()}`);

    ws.on("message", async (raw) => {
      // ✅ Story 12.8 — basic frame size guard (prevents huge JSON abuse)
      try {
        const sraw = String(raw || "");
        if (sraw.length > 64_000) {
          safeSend(ws, { type: "error", error: "Message too large" });
          try { ws.close(1009, "frame_too_large"); } catch (e) {}
          return;
        }
      } catch (e) {}

      const msg = parseJsonSafe(String(raw || ""));
      if (!msg || typeof msg !== "object") {
        return safeSend(ws, { type: "error", error: "Invalid JSON message" });
      }

      // ---------------------------
      // AUTH (first message)
      // ---------------------------
      if (!authed) {
        if (msg.type !== "auth") {
          return safeSend(ws, { type: "error", error: "Must auth first" });
        }

        try {
          const decoded = verifyAnyToken(msg.token);

          if (!decoded) {
            return safeSend(ws, { type: "error", error: "Unauthorized" });
          }

          // Capture demo identity if this is a demo token
          role = decoded.role || "unknown";
          const isDemo = (role === "demo" || decoded.demo === true);

          if (isDemo) {
            role = "demo";
            demo_jti = decoded.demo_jti || decoded.jti || null;

            // Secure default: demo is only valid if DEMO_JWT_SECRET exists
            const demoSecret = String(process.env.DEMO_JWT_SECRET || "").trim();
            if (!demoSecret) {
              return safeSend(ws, { type: "error", error: "Unauthorized" });
            }

            // Optional config (if exists)
            const cfg = (typeof demoConfig === "function") ? demoConfig() : null;
            if (cfg && cfg.enabled === false) {
              return safeSend(ws, { type: "error", error: "Unauthorized" });
            }

            // Optional ip_hash binding (ONLY if token has ip_hash AND helper exists)
            try {
              if (decoded.ip_hash && typeof getClientIp === "function" && typeof hashIp === "function") {
                const ip = getClientIp(req);
                const expected = hashIp(ip);
                if (decoded.ip_hash !== expected) {
                  return safeSend(ws, { type: "error", error: "Unauthorized" });
                }
              }
            } catch (e) {}

            // Force demo tenant id (env wins)
            const envDemoTenant = parseInt(process.env.DEMO_TENANT_ID || "0", 10);
            const forcedTenant = (envDemoTenant && envDemoTenant > 0)
              ? envDemoTenant
              : (cfg && cfg.tenantId ? cfg.tenantId : null);

            tenant_id = forcedTenant || decoded.tenant_id;
          } else {
            tenant_id = decoded.tenant_id;
          }

          if (!tenant_id) {
            return safeSend(ws, { type: "error", error: "Unauthorized (no tenant_id)" });
          }

          // Enforce max concurrent connections per tenant (Story 12.6)
          const set = getTenantSet(tenant_id);
          if (set.size >= WS_MAX_CONN_PER_TENANT) {
            safeSend(ws, { type: "error", error: "Tenant connection limit reached" });
            console.log(`[chat_ws] reject_max_conn ${connId} tenant=${tenant_id} max=${WS_MAX_CONN_PER_TENANT} current=${set.size}`);
            try { ws.close(1013, "tenant_max_connections"); } catch (e) {}
            return;
          }
          set.add(connId);

          session_id = normalizeSessionId(msg.session_id || "web");
          locale = normalizeLocale(msg.locale || "en-US");

          authed = true;
          safeSend(ws, { type: "connected", ok: true, tenant_id, session_id, locale });
          console.log(`[chat_ws] authed ${connId} tenant=${tenant_id} session=${session_id} locale=${locale} role=${role}`);
          return;
        } catch (e) {
          console.warn("🔐 [chat_ws] JWT verify failed:", e?.message || e);
          return safeSend(ws, { type: "error", error: "Unauthorized" });
        }
      }

      // Story 12.8.1: Additional demo-token rate limit (jti-based), without changing tenant limiter
      if (role === "demo" && demo_jti) {
        if (!rateLimitDemoToken(demo_jti)) {
          safeSend(ws, { type: "error", error: "Rate limited (demo token)" });
          safeSend(ws, { type: "done" });
          console.log(`[chat_ws] demo_token_rate_limited ${connId} tenant=${tenant_id} jti_present=true window_ms=${DEMO_TOKEN_RATE_WINDOW_MS} max_msgs=${getDemoTokenMaxMsgs()}`);
          return;
        }
      }

      // Per-tenant rate limit (Story 12.6) — applies after auth
      if (tenant_id && !rateLimitTenant(tenant_id)) {
        safeSend(ws, { type: "error", error: "Rate limited" });
        safeSend(ws, { type: "done" });
        console.log(`[chat_ws] rate_limited ${connId} tenant=${tenant_id} window_ms=${WS_RATE_WINDOW_MS} max_msgs=${WS_RATE_MAX_MSGS}`);
        return;
      }

      // ---------------------------
      // CLEAR SESSION (optional)
      // ---------------------------
      if (msg.type === "clear") {
        try {
          clearSession(tenant_id, session_id);
          safeSend(ws, { type: "cleared", ok: true, session_id });
          console.log(`[chat_ws] cleared ${connId} tenant=${tenant_id} session=${session_id}`);
        } catch (e) {
          safeSend(ws, { type: "error", error: "Failed to clear session" });
        }
        return;
      }

      // ---------------------------
      // USER MESSAGE
      // ---------------------------
      if (msg.type !== "user") {
        return safeSend(ws, { type: "error", error: "Unknown message type" });
      }

      const textRaw = String(msg.message || "");
      const text = textRaw.trim();

      if (!text) {
        return safeSend(ws, { type: "error", error: "Empty message" });
      }
      if (text.length > MAX_INCOMING_CHARS) {
        return safeSend(ws, { type: "error", error: `Message too long (max ${MAX_INCOMING_CHARS})` });
      }

      // ✅ Safe log: do NOT log raw content
      console.log(`[chat_ws] start ${connId} tenant=${tenant_id} session=${session_id} locale=${locale} msg_len=${text.length}`);

      // Store user turn
      try {
        pushTurn(tenant_id, session_id, "user", text);
      } catch (e) {
        console.warn("⚠️ [chat_ws] pushTurn failed:", e?.message || e);
      }

      // Build memory prefix
      let prefix = "";
      try {
        prefix = buildMemoryPrefix(tenant_id, session_id) || "";
      } catch (e) {
        console.warn("⚠️ [chat_ws] buildMemoryPrefix failed:", e?.message || e);
        prefix = "";
      }
      const brainInput = prefix + text;

      safeSend(ws, { type: "start" });

      try {
       // ✅ Story 12.8 — Guard retriever availability
if (typeof retrieveAnswer !== "function") {
  safeSend(ws, { type: "error", error: "Server misconfig: retriever not available" });
  safeSend(ws, { type: "done" });
  console.warn("[chat_ws] retriever missing: expected retrieveAnswerWithTimeout or retrieveAnswer export");
  return;
}

const result = await Promise.resolve(
  retrieveAnswer(brainInput, tenant_id, locale, session_id)
);


        const reply =
          (typeof result === "string") ? result :
          (result && typeof result.reply === "string") ? result.reply :
          (result && typeof result.answer === "string") ? result.answer :
          (result && result.data && typeof result.data.reply === "string") ? result.data.reply :
          JSON.stringify(result);

        for (const chunk of chunkText(reply, 18)) {
          safeSend(ws, { type: "token", data: chunk });
          await new Promise(r => setTimeout(r, 15));
        }

        safeSend(ws, { type: "done" });

        // Store assistant turn
        try {
          pushTurn(tenant_id, session_id, "assistant", reply);
        } catch (e) {
          console.warn("⚠️ [chat_ws] pushTurn(assistant) failed:", e?.message || e);
        }

        console.log(`[chat_ws] done ${connId} tenant=${tenant_id} session=${session_id} reply_len=${String(reply || "").length}`);
      } catch (err) {
        const msgSafe = err?.message || "unknown";
        console.log(`[chat_ws] error ${connId} tenant=${tenant_id} session=${session_id} err=${msgSafe}`);
        safeSend(ws, { type: "error", error: msgSafe });
        safeSend(ws, { type: "done" });
      }
    });

    ws.on("close", () => {
      // Remove from tenant set if authed
      try {
        if (tenant_id) {
          const set = getTenantSet(tenant_id);
          set.delete(connId);
        }
      } catch (e) {}

      console.log(`[chat_ws] closed ${connId}`);
    });

    ws.on("error", (e) => {
      console.log(`[chat_ws] ws error ${connId}:`, e?.message || e);
    });
  });
}

module.exports = { registerChatWs };
