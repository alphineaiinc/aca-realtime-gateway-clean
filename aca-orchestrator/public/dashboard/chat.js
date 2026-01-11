(function () {
  const chat = document.getElementById("chat");
  const msg = document.getElementById("msg");
  const send = document.getElementById("send");
  const jwt = document.getElementById("jwt");
  const saveJwt = document.getElementById("saveJwt");
  const clearJwt = document.getElementById("clearJwt");
  const statusEl = document.getElementById("status");
  const sessionIdEl = document.getElementById("sessionId");

  // Stable per-browser session id (no PII)
  const sidKey = "aca_webchat_sid";
  const tokenKey = "aca_webchat_jwt";

  const sid = localStorage.getItem(sidKey) || ("webchat_" + Math.random().toString(16).slice(2));
  localStorage.setItem(sidKey, sid);
  sessionIdEl.textContent = sid;

  jwt.value = localStorage.getItem(tokenKey) || "";

  function bubble(text, cls) {
    const el = document.createElement("div");
    el.className = "bubble " + cls;
    el.textContent = text;
    chat.appendChild(el);
    chat.scrollTop = chat.scrollHeight;
    return el;
  }

  function setStatus(s) { statusEl.textContent = s; }

  saveJwt.onclick = () => {
    localStorage.setItem(tokenKey, jwt.value.trim());
    bubble("JWT saved in this browser (localStorage).", "sys");
  };

  clearJwt.onclick = () => {
    localStorage.removeItem(tokenKey);
    jwt.value = "";
    bubble("JWT cleared.", "sys");
  };

  async function sendMessage() {
    const text = (msg.value || "").trim();
    if (!text) return;

    const token = (jwt.value || "").trim();
    if (!token) {
      bubble("Paste a JWT first (top right).", "sys");
      return;
    }

    bubble(text, "me");
    msg.value = "";
    setStatus("sending");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token
        },
        body: JSON.stringify({
          session_id: sid,
          message: text
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        bubble("Error: " + (data.error || res.statusText), "sys");
        setStatus("error");
        return;
      }

      bubble(data.reply || "(empty reply)", "bot");
      setStatus("idle");
    } catch (e) {
      bubble("Network error: " + (e?.message || e), "sys");
      setStatus("error");
    }
  }

  send.onclick = sendMessage;
  msg.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage();
  });

  bubble("Ready. Paste JWT and send a message.", "sys");
})();
