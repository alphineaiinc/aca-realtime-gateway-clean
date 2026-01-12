// public/dashboard/chat_ui_streaming.js
// Story 12.5 — Streaming hook using WebSocket (Render-safe)

(function () {
  const chatEl = document.getElementById("chat");
  const msgEl = document.getElementById("msg");
  const sendBtn = document.getElementById("send");

  const jwtEl = document.getElementById("jwt");
  const saveJwtBtn = document.getElementById("saveJwt");
  const clearJwtBtn = document.getElementById("clearJwt");

  const statusEl = document.getElementById("status");
  const sessionIdEl = document.getElementById("sessionId");
  const resetBtn = document.getElementById("resetSession");

  const LS_JWT_KEY = "aca_jwt";
  const LS_SESSION_KEY = "aca_session_id";

  function newSessionId() {
    return "webchat_" + Math.random().toString(16).slice(2) + "_" + Date.now();
  }

  let session_id = localStorage.getItem(LS_SESSION_KEY) || newSessionId();
  localStorage.setItem(LS_SESSION_KEY, session_id);
  if (sessionIdEl) sessionIdEl.textContent = session_id;

  function setStatus(s) {
    if (statusEl) statusEl.textContent = s;
  }

  function getJwt() {
    return (localStorage.getItem(LS_JWT_KEY) || "").trim();
  }

  function setJwt(v) {
    const val = String(v || "").trim();
    if (val) localStorage.setItem(LS_JWT_KEY, val);
    else localStorage.removeItem(LS_JWT_KEY);
  }

  if (jwtEl) jwtEl.value = getJwt();

  if (saveJwtBtn && jwtEl) {
    saveJwtBtn.addEventListener("click", (e) => {
      e.preventDefault();
      setJwt(jwtEl.value);
      setStatus(getJwt() ? "jwt saved" : "jwt missing");
      jwtEl.value = getJwt();
    });
  }

  if (clearJwtBtn && jwtEl) {
    clearJwtBtn.addEventListener("click", (e) => {
      e.preventDefault();
      setJwt("");
      jwtEl.value = "";
      setStatus("jwt cleared");
    });
  }

  function scrollToBottom() {
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  function makeMessage(role, text) {
    const row = document.createElement("div");
    row.className = "msg " + role;

    const bubble = document.createElement("div");
    bubble.className = "bubble " + role;
    bubble.textContent = text || "";

    row.appendChild(bubble);
    chatEl.appendChild(row);
    scrollToBottom();
    return bubble;
  }

  function setSending(sending) {
    sendBtn.disabled = !!sending;
    msgEl.disabled = !!sending;
    if (resetBtn) resetBtn.disabled = !!sending;
  }

  function getLocale() {
    return "en-US";
  }

  let wsClient = null;

  function ensureWs() {
    const jwt = getJwt();
    if (!jwt) {
      makeMessage("assistant", "Missing JWT. Paste JWT and click Save.");
      setStatus("jwt missing");
      return null;
    }

    // create a fresh connection each time (simplest + avoids stale socket)
    wsClient = createChatWsClient({
      token: jwt,
      session_id,
      locale: getLocale(),
      onConnected: () => setStatus("idle"),
      onStart: () => setStatus("thinking…"),
      onToken: (t) => {
        // the active assistant bubble is handled per-send below
        // this is a no-op here
      },
      onDone: () => {},
      onError: (err) => {
        makeMessage("assistant", `[Error: ${err}]`);
        setStatus("error");
        setSending(false);
      }
    });

    return wsClient;
  }

  async function resetSession() {
    setStatus("resetting…");
    setSending(true);

    // tell server to clear (best effort)
    try { if (wsClient) wsClient.clearSession(); } catch (e) {}

    session_id = newSessionId();
    localStorage.setItem(LS_SESSION_KEY, session_id);
    if (sessionIdEl) sessionIdEl.textContent = session_id;

    makeMessage("assistant", `Session reset. New session_id: ${session_id}`);
    setStatus("idle");
    setSending(false);
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", (e) => {
      e.preventDefault();
      resetSession();
    });
  }

  async function handleSend() {
    const message = (msgEl.value || "").trim();
    if (!message) return;

    msgEl.value = "";

    const jwt = getJwt();
    if (!jwt) {
      makeMessage("assistant", "Missing JWT. Paste JWT and click Save.");
      setStatus("jwt missing");
      return;
    }

    // Build bubbles
    makeMessage("user", message);
    const assistantBubble = makeMessage("assistant", "");

    setSending(true);
    setStatus("connecting…");

    // Create socket
    const client = ensureWs();
    if (!client) {
      setSending(false);
      return;
    }

    // Rewire token handlers for this send
    // (simple approach: close + reopen per message is also fine, but this works)
    const originalOnMessage = client.sendUser;

    // Patch token handling by listening on global ws events via window handler style:
    // Easiest: attach a temporary listener directly to ws via closure is not exposed;
    // So we do a simpler pattern: open a new WS per message with per-message handlers.
    try { if (wsClient) wsClient.close(); } catch (e) {}

    wsClient = createChatWsClient({
      token: jwt,
      session_id,
      locale: getLocale(),
      onConnected: () => setStatus("thinking…"),
      onStart: () => setStatus("thinking…"),
      onToken: (t) => {
        assistantBubble.textContent += t; // preserves spaces, avoids merged words
        scrollToBottom();
      },
      onDone: () => {
        setStatus("idle");
        setSending(false);
        try { if (wsClient) wsClient.close(); } catch (e) {}
      },
      onError: (err) => {
        assistantBubble.textContent += `\n[Error: ${err}]`;
        setStatus("error");
        setSending(false);
        try { if (wsClient) wsClient.close(); } catch (e) {}
      }
    });

    // Send the message
    wsClient.sendUser(message);
  }

  sendBtn.addEventListener("click", (e) => {
    e.preventDefault();
    handleSend();
  });

  msgEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  });

  setStatus(getJwt() ? "idle" : "jwt missing");
})();
