// public/dashboard/chat.js
// Classic (non-streaming) chat client for POST /api/chat
//
// Story 12.8.2 — Public Demo UX:
// - If URL has ?demo=1 (or demo=true), auto-mint a short-lived demo token via /api/demo/token
// - Store it in localStorage under the SAME key the rest of the UI uses: "aca_webchat_jwt"
// - Do not print token anywhere (no logs, no UI dumps)
// - If demo token mint fails, show a safe message

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

  // ✅ IMPORTANT: use the same key across demo + WS + REST pages
  const tokenKey = "aca_webchat_jwt";

  const params = new URLSearchParams(window.location.search || "");
  const isDemo = params.get("demo") === "1" || params.get("demo") === "true";

  const sid =
    localStorage.getItem(sidKey) ||
    ("webchat_" + Math.random().toString(16).slice(2) + "_" + Date.now());

  localStorage.setItem(sidKey, sid);
  if (sessionIdEl) sessionIdEl.textContent = sid;

  if (jwt) jwt.value = localStorage.getItem(tokenKey) || "";

  function bubble(text, cls) {
    const el = document.createElement("div");
    el.className = "bubble " + cls;
    el.textContent = text;
    chat.appendChild(el);
    chat.scrollTop = chat.scrollHeight;
    return el;
  }

  function setStatus(s) {
    if (statusEl) statusEl.textContent = s;
  }

  function getToken() {
    return String((jwt && jwt.value) || localStorage.getItem(tokenKey) || "").trim();
  }

  function setToken(t) {
    const val = String(t || "").trim();
    if (val) localStorage.setItem(tokenKey, val);
    else localStorage.removeItem(tokenKey);

    if (jwt) jwt.value = val;
  }

  if (saveJwt && jwt) {
    saveJwt.onclick = () => {
      setToken(jwt.value);
      bubble("JWT saved in this browser (localStorage).", "sys");
      setStatus(getToken() ? "jwt saved" : "jwt missing");
    };
  }

  if (clearJwt && jwt) {
    clearJwt.onclick = () => {
      setToken("");
      bubble("JWT cleared.", "sys");
      setStatus("jwt cleared");
    };
  }

  // ------------------------------------------------------------
  // Demo token mint (Story 12.8.2)
  // ------------------------------------------------------------
  async function ensureDemoTokenIfNeeded() {
    if (!isDemo) return;

    // If token already exists, keep it (avoid unnecessary mints)
    if (getToken()) {
      setStatus("demo ready");
      return;
    }

    setStatus("demo: preparing…");
    bubble("Demo mode: preparing a secure demo session…", "sys");

    // Tight timeout to avoid hanging UI
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await fetch("/api/demo/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Same-origin only. Demo endpoint enforces Origin allowlist server-side.
        body: JSON.stringify({}),
        signal: controller.signal,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data || !data.ok || !data.token) {
        bubble(
          "Demo token not available. Demo may be disabled or your origin is not allowed.",
          "sys"
        );
        setStatus("demo token failed");
        return;
      }

      // ✅ Store token but NEVER display it
      setToken(data.token);
      setStatus("demo ready");
      bubble("Demo session ready. You can start chatting.", "sys");
    } catch (e) {
      bubble(
        "Demo token request failed. Please refresh the page. If it persists, demo may be disabled.",
        "sys"
      );
      setStatus("demo token error");
    } finally {
      clearTimeout(timeout);
    }
  }

  // ------------------------------------------------------------
  // Send message (REST)
  // ------------------------------------------------------------
  async function sendMessage() {
    const text = (msg && msg.value ? msg.value : "").trim();
    if (!text) return;

    const token = getToken();
    if (!token) {
      if (isDemo) {
        bubble("Demo token missing. Please refresh the page.", "sys");
      } else {
        bubble("Paste a JWT first (top right).", "sys");
      }
      return;
    }

    bubble(text, "me");
    if (msg) msg.value = "";
    setStatus("sending");

    // Request timeout (avoid hangs)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token,
        },
        body: JSON.stringify({
          session_id: sid,
          message: text,
          // locale intentionally omitted here to keep existing behavior minimal
        }),
        signal: controller.signal,
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
    } finally {
      clearTimeout(timeout);
    }
  }

  if (send) send.onclick = sendMessage;
  if (msg) {
    msg.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendMessage();
    });
  }

  // Boot
  if (isDemo) {
    bubble("Demo mode enabled.", "sys");
  } else {
    bubble("Ready. Paste JWT and send a message.", "sys");
  }
  setStatus(getToken() ? "idle" : (isDemo ? "demo: preparing" : "idle"));

  // Mint demo token (if needed) after UI binds
  ensureDemoTokenIfNeeded();
})();
