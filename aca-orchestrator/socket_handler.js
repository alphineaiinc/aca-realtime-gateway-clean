// socket_handler.js
// Story 12.6 — WebSocket Production Hardening Pack (tenant-safe)
// - Per-tenant rate limiting
// - Max concurrent WS connections per tenant
// - TTL-based session memory eviction
// - Safe audit logs (NO raw message content)
// - Preserves Twilio Media Streams "event.start.customParameters.business_id" attach logic

const WebSocket = require("ws");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const { audit } = require("./src/brain/utils/auditLogger");

// ------------------------------------------------------------------
// Security-first defaults (override via Render env vars)
// ------------------------------------------------------------------
const WS_MAX_CONN_PER_TENANT = parseInt(process.env.WS_MAX_CONN_PER_TENANT || "5", 10);

const WS_RATE_WINDOW_MS = parseInt(process.env.WS_RATE_WINDOW_MS || "10000", 10); // 10s window
const WS_RATE_MAX_MSGS = parseInt(process.env.WS_RATE_MAX_MSGS || "30", 10);       // 30 msgs / window

const SESSION_TTL_MS = parseInt(process.env.SESSION_TTL_MS || "1800000", 10); // 30 mins
const SESSION_SWEEP_MS = parseInt(process.env.SESSION_SWEEP_MS || "60000", 10); // 60s
const SESSION_MAX_TURNS = parseInt(process.env.SESSION_MAX_TURNS || "30", 10);   // bounded memory

// ------------------------------------------------------------------
// Tenant-safe in-memory guards
// ------------------------------------------------------------------

// tenantKey -> Set(ws)
const tenantConnections = new Map();

// tenantKey -> { count, resetAt }
const tenantRate = new Map();

// sessionKey -> { tenantKey, history: Array<{role,len,ts}>, lastSeen }
const sessionMemory = new Map();

function nowMs() {
  return Date.now();
}

function safeHash(value) {
  try {
    return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
  } catch {
    return "hash_error";
  }
}

function tenantKeyFromWs(ws) {
  // Prefer ws.business_id (Twilio customParameters) if present,
  // otherwise fall back to ws.tenant_id, else "unknown".
  return String(ws.business_id || ws.tenant_id || "unknown");
}

function getTenantSet(tenantKey) {
  if (!tenantConnections.has(tenantKey)) tenantConnections.set(tenantKey, new Set());
  return tenantConnections.get(tenantKey);
}

function rateLimitTenant(tenantKey) {
  const now = nowMs();
  const bucket = tenantRate.get(tenantKey) || { count: 0, resetAt: now + WS_RATE_WINDOW_MS };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + WS_RATE_WINDOW_MS;
  }
  bucket.count += 1;
  tenantRate.set(tenantKey, bucket);
  return bucket.count <= WS_RATE_MAX_MSGS;
}

function getOrCreateSession(sessionKey, tenantKey) {
  const existing = sessionMemory.get(sessionKey);
  if (existing) {
    existing.lastSeen = nowMs();
    return existing;
  }
  const s = { tenantKey, history: [], lastSeen: nowMs() };
  sessionMemory.set(sessionKey, s);
  return s;
}

function touchSession(sessionKey) {
  const s = sessionMemory.get(sessionKey);
  if (s) s.lastSeen = nowMs();
}

function trimHistory(history) {
  if (!Array.isArray(history)) return [];
  if (history.length <= SESSION_MAX_TURNS) return history;
  return history.slice(history.length - SESSION_MAX_TURNS);
}

function sweepSessionMemory() {
  const cutoff = nowMs() - SESSION_TTL_MS;
  let evicted = 0;

  for (const [sid, s] of sessionMemory.entries()) {
    if (!s || !s.lastSeen || s.lastSeen < cutoff) {
      sessionMemory.delete(sid);
      evicted += 1;
    }
  }

  if (evicted > 0) {
    audit({
      type: "session_eviction",
      evicted,
      sessions_remaining: sessionMemory.size,
      ttl_ms: SESSION_TTL_MS,
    });
  }
}

// Run sweeper (do not keep process alive solely for this)
setInterval(sweepSessionMemory, SESSION_SWEEP_MS).unref?.();

// ------------------------------------------------------------------
// Auth token extraction (for browser WS clients / API tools)
// ------------------------------------------------------------------
function extractToken(req) {
  // Query param: ?jwt=... or ?token=...
  try {
    const url = new URL(req.url, "http://localhost");
    const t1 = url.searchParams.get("jwt");
    const t2 = url.searchParams.get("token");
    if (t1) return t1;
    if (t2) return t2;
  } catch (e) {}

  // Sec-WebSocket-Protocol sometimes carries token(s)
  const proto = req.headers["sec-websocket-protocol"];
  if (proto) {
    const parts = String(proto).split(",").map((s) => s.trim());
    const jwtPart = parts.find((p) => (p.match(/\./g) || []).length === 2);
    if (jwtPart) return jwtPart;
  }

  // Authorization: Bearer ...
  const auth = req.headers["authorization"] || req.headers["Authorization"];
  if (auth && String(auth).startsWith("Bearer ")) return String(auth).slice(7);

  return "";
}

function tryDecodeJwt(req) {
  const token = extractToken(req);
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------
// Main binder
// ------------------------------------------------------------------
function bindWebSocket(server) {
  const wss = new WebSocket.Server({ server });

  wss.on("connection", (ws, req) => {
    // Attach decoded identity (if present). Do NOT log token.
    const decoded = tryDecodeJwt(req);

    // These can exist for web chat usage
    if (decoded) {
      ws.tenant_id = decoded.tenant_id != null ? String(decoded.tenant_id) : undefined;
      ws.session_id =
        decoded.session_id != null
          ? String(decoded.session_id)
          : decoded.session != null
          ? String(decoded.session)
          : decoded.sid != null
          ? String(decoded.sid)
          : undefined;
      ws.role = decoded.role || "unknown";
      ws.partner_id = decoded.partner_id != null ? String(decoded.partner_id) : undefined;
    }

    // Determine tenant key (business_id preferred if later attached by Twilio start)
    let tKey = tenantKeyFromWs(ws);

    // Enforce max connections per tenant immediately (best-effort)
    // If tenant is unknown at connect time, we allow connect, but enforce once we know tenant.
    if (tKey !== "unknown") {
      const set = getTenantSet(tKey);
      if (set.size >= WS_MAX_CONN_PER_TENANT) {
        audit({
          type: "ws_reject_max_conn",
          tenant_key: tKey,
          session_hash: safeHash(ws.session_id || "no_session"),
          max_conn: WS_MAX_CONN_PER_TENANT,
          current_conn: set.size,
        });
        ws.close(1013, "tenant_max_connections");
        return;
      }
      set.add(ws);
    }

    // Session memory init (web chat)
    if (ws.session_id && tKey !== "unknown") {
      getOrCreateSession(String(ws.session_id), tKey);
    }

    audit({
      type: "ws_connected",
      tenant_key: tKey,
      session_hash: safeHash(ws.session_id || "no_session"),
      role: ws.role || "unknown",
    });

    ws.on("message", async (raw) => {
      const start = nowMs();

      // Parse JSON safely
      let msg;
      try {
        msg = JSON.parse(String(raw || ""));
      } catch (e) {
        audit({
          type: "ws_bad_json",
          tenant_key: tenantKeyFromWs(ws),
          session_hash: safeHash(ws.session_id || "no_session"),
          raw_len: raw ? Buffer.byteLength(raw) : 0,
        });
        try {
          ws.send(JSON.stringify({ ok: false, error: "bad_json" }));
        } catch {}
        return;
      }

      // ------------------------------------------------------------------
      // ✅ Preserve your Twilio start event behavior (exactly)
      // ------------------------------------------------------------------
      // If the message looks like a Twilio Media Streams event:
      // { event: "start", start: { customParameters: { business_id: "..." } } }
      if (msg && msg.event === "start" && msg.start && msg.start.customParameters) {
        ws.business_id = msg.start.customParameters.business_id;
        console.log("🧩 Business context attached:", ws.business_id);

        // Once we know tenant, enforce max connections and set membership safely
        const newTenantKey = tenantKeyFromWs(ws);
        const set = getTenantSet(newTenantKey);

        // If ws was previously counted under another tenantKey, remove it
        // (Most cases: was "unknown")
        if (tKey && tKey !== newTenantKey) {
          const oldSet = getTenantSet(tKey);
          oldSet.delete(ws);
        }

        // Enforce max connections
        if (set.size >= WS_MAX_CONN_PER_TENANT) {
          audit({
            type: "ws_reject_max_conn",
            tenant_key: newTenantKey,
            session_hash: safeHash(ws.session_id || "no_session"),
            max_conn: WS_MAX_CONN_PER_TENANT,
            current_conn: set.size,
          });
          ws.close(1013, "tenant_max_connections");
          return;
        }

        set.add(ws);
        tKey = newTenantKey;

        audit({
          type: "ws_twilio_start",
          tenant_key: newTenantKey,
          session_hash: safeHash(ws.session_id || "no_session"),
        });

        return; // Twilio start handled
      }

      // ------------------------------------------------------------------
      // Tenant identification for rate limiting & auditing
      // ------------------------------------------------------------------
      const tenantKey = tenantKeyFromWs(ws);

      // Rate limit per tenant (soft-fail)
      if (tenantKey !== "unknown" && !rateLimitTenant(tenantKey)) {
        audit({
          type: "ws_rate_limited",
          tenant_key: tenantKey,
          session_hash: safeHash(ws.session_id || "no_session"),
          window_ms: WS_RATE_WINDOW_MS,
          max_msgs: WS_RATE_MAX_MSGS,
        });
        try {
          ws.send(
            JSON.stringify({
              ok: false,
              error: "rate_limited",
              message: "Too many messages. Please slow down.",
            })
          );
        } catch {}
        return;
      }

      // ------------------------------------------------------------------
      // Web chat style payload support (NO raw content logging)
      // ------------------------------------------------------------------
      // We intentionally do NOT log msg.text / msg.message / msg.data content.
      const text =
        typeof msg.text === "string"
          ? msg.text
          : typeof msg.message === "string"
          ? msg.message
          : "";

      const locale =
        typeof msg.locale === "string"
          ? msg.locale
          : typeof msg.lang === "string"
          ? msg.lang
          : "en-US";

      // Session key: prefer ws.session_id from JWT; else accept msg.session_id; else per-connection hash
      const sessionKey =
        ws.session_id ||
        (msg.session_id != null ? String(msg.session_id) : null) ||
        `ws_${safeHash(ws._socket ? ws._socket.remoteAddress : "na")}`;

      // Keep minimal bounded memory for web chat sessions
      if (tenantKey !== "unknown") {
        const s = getOrCreateSession(String(sessionKey), tenantKey);
        touchSession(String(sessionKey));

        if (text) {
          s.history.push({ role: "user", len: text.length, ts: new Date().toISOString() });
          s.history = trimHistory(s.history);
        }

        audit({
          type: "ws_user_msg",
          tenant_key: tenantKey,
          session_hash: safeHash(sessionKey),
          locale,
          msg_len: text.length,
          hist_len: s.history.length,
        });
      } else {
        audit({
          type: "ws_user_msg_unknown_tenant",
          session_hash: safeHash(sessionKey),
          locale,
          msg_len: text.length,
        });
      }

      // IMPORTANT:
      // This handler does NOT call retrieveAnswer() directly because your project may route
      // Twilio vs WebChat differently elsewhere. We keep this file production-safe and
      // focused on hardening. If your existing Story 12.5 already calls retrieveAnswer()
      // in another layer, keep that logic there.
      //
      // However, we still provide a minimal echo response for non-Twilio payloads if needed.
      // If you already send responses elsewhere, you can remove this block safely.
      if (msg && msg.type === "ping") {
        try {
          ws.send(JSON.stringify({ ok: true, type: "pong" }));
        } catch {}
        return;
      }

      // If your existing system expects this handler to respond,
      // respond with a safe acknowledgement by default.
      if (msg && (msg.text || msg.message)) {
        try {
          ws.send(
            JSON.stringify({
              ok: true,
              type: "received",
              session_id: ws.session_id || sessionKey,
              locale,
            })
          );
        } catch {}
      }

      const ms = nowMs() - start;
      audit({
        type: "ws_message_processed",
        tenant_key: tenantKey,
        session_hash: safeHash(sessionKey),
        ms,
      });
    });

    ws.on("close", () => {
      const tenantKey = tenantKeyFromWs(ws);
      if (tenantKey !== "unknown") {
        const set = getTenantSet(tenantKey);
        set.delete(ws);
      }

      audit({
        type: "ws_closed",
        tenant_key: tenantKey,
        session_hash: safeHash(ws.session_id || "no_session"),
        tenant_conn: tenantKey !== "unknown" ? getTenantSet(tenantKey).size : null,
      });
    });

    ws.on("error", () => {
      audit({
        type: "ws_error",
        tenant_key: tenantKeyFromWs(ws),
        session_hash: safeHash(ws.session_id || "no_session"),
      });
    });
  });

  return wss;
}

// ------------------------------------------------------------------
// Export in a backwards-compatible way:
// - callable default export
// - named export bindWebSocket
// ------------------------------------------------------------------
function socketHandler(server) {
  return bindWebSocket(server);
}

socketHandler.bindWebSocket = bindWebSocket;

module.exports = socketHandler;
module.exports.bindWebSocket = bindWebSocket;
