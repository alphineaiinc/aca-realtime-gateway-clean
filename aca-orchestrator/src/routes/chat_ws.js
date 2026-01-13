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

// Reuse existing ACA brain
const { retrieveAnswer } = require("../../retriever");

// Memory
const { pushTurn, buildMemoryPrefix, clearSession } = require("../brain/utils/sessionMemory");

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
const RETRIEVE_TIMEOUT_MS = parseInt(process.env.RETRIEVE_TIMEOUT_MS || "20000", 10); // 20s

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

function withTimeout(promise, ms, label = "timeout") {
  let t = null;
  const timeoutPromise = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(label)), ms);
  });
  return Promise.race([
    promise.finally(() => {
      try { if (t) clearTimeout(t); } catch (e) {}
    }),
    timeoutPromise,
  ]);
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

function registerChatWs(app) {
  app.ws("/ws/chat", (ws, req) => {
    const connId = `ws_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    let authed = false;
    let tenant_id = null;
    let session_id = "web";
    let locale = "en-US";

    // ✅ Safe proof logs (no tokens, no raw message content)
    console.log(`[chat_ws] connected ${connId}`);
    console.log(`[chat_ws] /ws/chat WS CONNECT attempt ${new Date().toISOString()}`);

    ws.on("message", async (raw) => {
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
          const token = String(msg.token || "").replace("Bearer ", "").trim();
          const decoded = jwt.verify(token, process.env.JWT_SECRET);

          tenant_id = decoded.tenant_id;
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

          session_id = String(msg.session_id || "web");
          locale = String(msg.locale || "en-US");

          authed = true;
          safeSend(ws, { type: "connected", ok: true, tenant_id, session_id, locale });
          console.log(`[chat_ws] authed ${connId} tenant=${tenant_id} session=${session_id} locale=${locale}`);
          return;
        } catch (e) {
          return safeSend(ws, { type: "error", error: "Unauthorized" });
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

      // Store user turn (sessionMemory module should handle its own trimming)
      pushTurn(tenant_id, session_id, "user", text);

      // Build memory prefix (no brain signature changes)
      const prefix = buildMemoryPrefix(tenant_id, session_id);
      const brainInput = prefix + text;

      safeSend(ws, { type: "start" });

      try {
        // ✅ Story 12.6 — timeout guard
        // IMPORTANT: retrieveAnswer signature in retriever.js is:
        // retrieveAnswer(userQuery, tenantId, langCode="en-US", sessionId=null)
        // So we call as (brainInput, tenant_id, locale, session_id)
        const result = await withTimeout(
          Promise.resolve(retrieveAnswer(brainInput, tenant_id, locale, session_id)),
          RETRIEVE_TIMEOUT_MS,
          "retrieve_timeout"
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
        pushTurn(tenant_id, session_id, "assistant", reply);

        console.log(`[chat_ws] done ${connId} tenant=${tenant_id} session=${session_id} reply_len=${String(reply || "").length}`);
      } catch (err) {
        const msgSafe = err?.message || "unknown";
        console.log(`[chat_ws] error ${connId} tenant=${tenant_id} session=${session_id} err=${msgSafe}`);
        safeSend(ws, { type: "error", error: msgSafe === "retrieve_timeout" ? "Timeout. Please try again." : "Server error" });
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
