// public/dashboard/chat_ui_streaming.js
// Story 12.5 — WebSocket streaming UI (Render-safe)
// Fix: do not send before WS is open+authed (handled by chat_ws_client queue)

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
      // reset client so it re-auths with the new token
      try { if (wsClient) wsClient.close(); } catch (e2) {}
      wsClient = null;
    });
  }

  if (clearJwtBtn && jwtEl) {
    clearJwtBtn.addEventListener("click", (e) => {
      e.preventDefault();
      setJwt("");
      jwtEl.value = "";
      setStatus("jwt cleared");
      try { if (wsClient) wsClient.close(); } catch (e2) {}
      wsClient = null;
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
  let activeAssistantBubble = null;

  function ensureClient() {
    const jwt = getJwt();
    if (!jwt) {
      makeMessage("assistant", "Missing JWT. Paste JWT and click Save.");
      setStatus("jwt missing");
      return null;
    }

    if (wsClient) return wsClient;

    setStatus("connecting…");

    wsClient = createChatWsClient({
      token: jwt,
      session_id,
      locale: getLocale(),

      onConnected: () => {
        setStatus("idle");
      },

      onStart: () => {
        setStatus("thinking…");
      },

      onToken: (t) => {
        if (!activeAssistantBubble) return;
        activeAssistantBubble.textContent += t; // preserves spaces
        scrollToBottom();
      },

      onDone: () => {
        setStatus("idle");
        setSending(false);
        activeAssistantBubble = null;
      },

      onError: (err) => {
        if (activeAssistantBubble) {
          activeAssistantBubble.textContent += `\n[Error: ${err}]`;
        } else {
          makeMessage("assistant", `[Error: ${err}]`);
        }
        setStatus("error");
        setSending(false);
        activeAssistantBubble = null;

        // reset socket on error so next send reconnects cleanly
        try { if (wsClient) wsClient.close(); } catch (e2) {}
        wsClient = null;
      }
    });

    return wsClient;
  }

  async function resetSession() {
    setStatus("resetting…");
    setSending(true);

    // best effort clear on server
    try {
      const c = ensureClient();
      if (c) c.clearSession();
    } catch (e) {}

    session_id = newSessionId();
    localStorage.setItem(LS_SESSION_KEY, session_id);
    if (sessionIdEl) sessionIdEl.textContent = session_id;

    makeMessage("assistant", `Session reset. New session_id: ${session_id}`);

    // recreate socket so auth uses new session_id
    try { if (wsClient) wsClient.close(); } catch (e2) {}
    wsClient = null;

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

    const c = ensureClient();
    if (!c) return;

    makeMessage("user", message);
    activeAssistantBubble = makeMessage("assistant", "");

    setSending(true);
    setStatus("connecting…");

    // ✅ safe: client queues until OPEN + authed
    c.sendUser(message);
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
