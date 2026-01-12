// public/dashboard/chat_ws_client.js
// Story 12.5 — WebSocket streaming client for /ws/chat

function makeWsUrl(path) {
  const proto = (location.protocol === "https:") ? "wss:" : "ws:";
  return `${proto}//${location.host}${path}`;
}

function createChatWsClient({ token, session_id, locale, onConnected, onStart, onToken, onDone, onError }) {
  const ws = new WebSocket(makeWsUrl("/ws/chat"));

  ws.addEventListener("open", () => {
    ws.send(JSON.stringify({
      type: "auth",
      token,
      session_id,
      locale
    }));
  });

  ws.addEventListener("message", (ev) => {
    let msg = null;
    try { msg = JSON.parse(ev.data); } catch (e) {}

    if (!msg) return;

    if (msg.type === "connected") onConnected && onConnected(msg);
    else if (msg.type === "start") onStart && onStart();
    else if (msg.type === "token") onToken && onToken(msg.data || "");
    else if (msg.type === "done") onDone && onDone();
    else if (msg.type === "error") onError && onError(msg.error || "error");
  });

  ws.addEventListener("close", () => {
    // optional: you can surface a “disconnected” state
  });

  ws.addEventListener("error", () => {
    onError && onError("WebSocket error");
  });

  return {
    sendUser(message) {
      ws.send(JSON.stringify({ type: "user", message }));
    },
    clearSession() {
      ws.send(JSON.stringify({ type: "clear" }));
    },
    close() {
      try { ws.close(); } catch (e) {}
    }
  };
}
