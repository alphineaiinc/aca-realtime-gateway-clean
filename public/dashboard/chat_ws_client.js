// public/dashboard/chat_ws_client.js
// Story 12.5 — WebSocket streaming client for /ws/chat (Render-safe)
//
// Fix:
// - Queue outgoing messages until socket is OPEN and server confirms auth (type:"connected")
// - Avoid "WebSocket error" caused by sending while CONNECTING
//
// Story 12.8.2 (Demo UX hardening):
// - Support token refresh / swap (client can be closed & recreated cleanly)
// - Prevent unbounded queue growth if auth never completes
// - Add safe reconnect hints (no secrets, no spam)
//
// Ref: Browser throws if send() is called while CONNECTING. (MDN)

function makeWsUrl(path) {
  const proto = (location.protocol === "https:") ? "wss:" : "ws:";
  return `${proto}//${location.host}${path}`;
}

function createChatWsClient({
  token,
  session_id,
  locale,
  onConnected,
  onStart,
  onToken,
  onDone,
  onError
}) {
  const ws = new WebSocket(makeWsUrl("/ws/chat"));

  let isOpen = false;
  let isAuthed = false;
  let closed = false;

  // ✅ Safety: bounded queue so a broken connection can’t grow memory forever
  const MAX_QUEUE = 50;
  const queue = []; // queued JSON objects to send once ready

  function safeEmitError(msg) {
    try { onError && onError(msg); } catch (e) {}
  }

  function pushQueue(obj) {
    if (queue.length >= MAX_QUEUE) {
      // Drop oldest to keep UI responsive and prevent memory growth
      queue.shift();
    }
    queue.push(obj);
  }

  function flushQueue() {
    if (!isOpen || !isAuthed || closed) return;
    while (queue.length) {
      const obj = queue.shift();
      try {
        ws.send(JSON.stringify(obj));
      } catch (e) {
        safeEmitError("Failed to send message over WebSocket.");
        break;
      }
    }
  }

  function sendJson(obj) {
    if (closed) return;
    if (!isOpen || !isAuthed) {
      pushQueue(obj);
      return;
    }
    try {
      ws.send(JSON.stringify(obj));
    } catch (e) {
      safeEmitError("Failed to send message over WebSocket.");
    }
  }

  ws.addEventListener("open", () => {
    isOpen = true;
    // send auth immediately on open
    try {
      ws.send(JSON.stringify({
        type: "auth",
        token,
        session_id,
        locale
      }));
    } catch (e) {
      safeEmitError("WebSocket opened but auth send failed.");
    }
  });

  ws.addEventListener("message", (ev) => {
    let msg = null;
    try { msg = JSON.parse(ev.data); } catch (e) {}

    if (!msg) return;

    if (msg.type === "connected") {
      isAuthed = true;
      try { onConnected && onConnected(msg); } catch (e) {}
      flushQueue();
      return;
    }

    if (msg.type === "start") {
      try { onStart && onStart(); } catch (e) {}
      return;
    }

    if (msg.type === "token") {
      try { onToken && onToken(msg.data || ""); } catch (e) {}
      return;
    }

    if (msg.type === "done") {
      try { onDone && onDone(); } catch (e) {}
      return;
    }

    if (msg.type === "error") {
      safeEmitError(msg.error || "error");
      return;
    }
  });

  ws.addEventListener("close", (ev) => {
    closed = true;

    // Only surface as error if it closed unexpectedly
    // 1000 = normal closure
    // 1013 = Try again later (server overload / tenant_max_connections, etc.)
    if (ev && ev.code && ev.code !== 1000) {
      if (ev.code === 1013) {
        safeEmitError("WebSocket busy (server asked to retry). Please try again in a moment.");
      } else {
        safeEmitError(`WebSocket closed (code ${ev.code}).`);
      }
    }
  });

  ws.addEventListener("error", () => {
    // Browser doesn't expose detail. Often occurs when send() fails or socket breaks.
    // Do NOT spam errors if we are already closed.
    if (!closed) safeEmitError("WebSocket error");
  });

  return {
    sendUser(message) {
      sendJson({ type: "user", message });
    },
    clearSession() {
      sendJson({ type: "clear" });
    },
    close() {
      try { ws.close(1000, "client close"); } catch (e) {}
    }
  };
}
