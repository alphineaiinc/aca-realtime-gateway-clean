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

    console.log(`[chat_ws] connected ${connId}`);

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

      console.log(`[chat_ws] start ${connId} tenant=${tenant_id} session=${session_id} locale=${locale}`);

      // Store user turn
      pushTurn(tenant_id, session_id, "user", text);

      // Build memory prefix (no brain signature changes)
      const prefix = buildMemoryPrefix(tenant_id, session_id);
      const brainInput = prefix + text;

      safeSend(ws, { type: "start" });

      try {
        const result = await retrieveAnswer(brainInput, tenant_id, session_id, locale);

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

        console.log(`[chat_ws] done ${connId} tenant=${tenant_id} session=${session_id}`);
      } catch (err) {
        console.log(`[chat_ws] error ${connId} tenant=${tenant_id} msg=${err?.message || "unknown"}`);
        safeSend(ws, { type: "error", error: err?.message || "Server error" });
        safeSend(ws, { type: "done" });
      }
    });

    ws.on("close", () => {
      console.log(`[chat_ws] closed ${connId}`);
    });

    ws.on("error", (e) => {
      console.log(`[chat_ws] ws error ${connId}:`, e?.message || e);
    });
  });
}

module.exports = { registerChatWs };
