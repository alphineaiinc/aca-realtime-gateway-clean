// public/dashboard/chat_ui_streaming.js
// Story 12.5 — Streaming hook for ACA Web Chat UI + Reset Session button support
// Works with chat.html IDs: #chat, #msg, #send, #jwt, #saveJwt, #clearJwt, #status, #sessionId, #resetSession (new)
// Requires /dashboard/chat_stream.js loaded BEFORE this file.
// Safety: textContent only (no innerHTML). Tenant-safe session_id reused via localStorage.
// Compatibility: uses CAPTURE listeners + stopImmediatePropagation() to override any handlers from chat.js.

(function () {
  // -----------------------------
  // DOM
  // -----------------------------
  const chatEl = document.getElementById("chat");         // message list container
  const msgEl = document.getElementById("msg");           // input
  const sendBtn = document.getElementById("send");        // send button

  const jwtEl = document.getElementById("jwt");           // JWT input (without "Bearer ")
  const saveJwtBtn = document.getElementById("saveJwt");
  const clearJwtBtn = document.getElementById("clearJwt");

  const statusEl = document.getElementById("status");
  const sessionIdEl = document.getElementById("sessionId");

  const resetBtn = document.getElementById("resetSession"); // NEW (added in chat.html)

  if (!chatEl || !msgEl || !sendBtn) {
    console.error("[chat_ui_streaming] Missing required DOM nodes (#chat, #msg, #send).");
    return;
  }
  if (typeof window.streamChatReply !== "function") {
    console.error("[chat_ui_streaming] streamChatReply() not found. Ensure /dashboard/chat_stream.js is loaded first.");
    return;
  }

  // -----------------------------
  // Session + auth storage
  // -----------------------------
  const LS_JWT_KEY = "aca_jwt";          // stored WITHOUT "Bearer "
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

  // Prefill JWT input (masked)
  if (jwtEl) jwtEl.value = getJwt();

  // Save / Clear JWT
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

  // -----------------------------
  // UI helpers
  // -----------------------------
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

  // -----------------------------
  // Reset session (server memory + local id)
  // -----------------------------
  async function clearServerSessionMemory(oldSessionId) {
    const jwt = getJwt();
    if (!jwt) return;

    const resp = await fetch("/api/chat/session/clear", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${jwt}`
      },
      body: JSON.stringify({ session_id: oldSessionId })
    });

    // If it fails, we still proceed with local reset (best-effort)
    try { await resp.json(); } catch (e) {}
  }

  async function resetSession() {
    const oldSessionId = session_id;

    setStatus("resetting…");
    setSending(true);

    try {
      await clearServerSessionMemory(oldSessionId);
    } catch (e) {
      // ignore — best effort
    }

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
      e.stopPropagation();
      e.stopImmediatePropagation();
      resetSession();
    }, true);
  }

  // -----------------------------
  // Streaming send
  // -----------------------------
  async function sendStreaming(message) {
    const jwt = getJwt();
    if (!jwt) {
      makeMessage("assistant", "Missing JWT. Paste JWT and click Save.");
      setStatus("jwt missing");
      return;
    }

    makeMessage("user", message);

    // Assistant bubble EMPTY
    const assistantBubble = makeMessage("assistant", "");

    setSending(true);
    setStatus("thinking…");

    await window.streamChatReply({
      token: jwt,
      message,
      session_id,
      locale: getLocale(),

      onToken: (t) => {
        assistantBubble.textContent += t;
        scrollToBottom();
      },

      onDone: () => {
        setStatus("idle");
        setSending(false);
      },

      onError: (err) => {
        assistantBubble.textContent += `\n[Error: ${err}]`;
        setStatus("error");
        setSending(false);
      }
    });
  }

  async function handleSend() {
    const message = (msgEl.value || "").trim();
    if (!message) return;

    msgEl.value = "";
    await sendStreaming(message);
  }

  // -----------------------------
  // Override any existing handlers from chat.js
  // -----------------------------
  sendBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    handleSend();
  }, true);

  msgEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      handleSend();
    }
  }, true);

  setStatus(getJwt() ? "idle" : "jwt missing");
})();
