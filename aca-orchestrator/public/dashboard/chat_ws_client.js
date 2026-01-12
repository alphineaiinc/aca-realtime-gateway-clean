// public/dashboard/chat_ws_client.js
// Story 12.5 — WebSocket streaming client for /ws/chat (Render-safe)
//
// Fix:
// - Queue outgoing messages until socket is OPEN and server confirms auth (type:"connected")
// - Avoid "WebSocket error" caused by sending while CONNECTING
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

  const queue = []; // queued JSON objects to send once ready

  function safeEmitError(msg) {
    try { onError && onError(msg); } catch (e) {}
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
      queue.push(obj);
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
    if (ev && ev.code && ev.code !== 1000) {
      safeEmitError(`WebSocket closed (code ${ev.code}).`);
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
