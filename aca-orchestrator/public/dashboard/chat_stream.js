// public/dashboard/chat_stream.js
// Story 12.5 — Robust SSE reader for /api/chat/stream
// Fixes:
// - Never trim token data
// - Never crash parsing (prevents browser abort -> "client closed early")

async function streamChatReply({ token, message, session_id, locale, onToken, onDone, onError, onConnected, onStart }) {
  let reader;

  try {
    const raw = String(token || "").trim();
    const bearer = raw.startsWith("Bearer ") ? raw : `Bearer ${raw}`;

    const resp = await fetch("/api/chat/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": bearer
      },
      body: JSON.stringify({ message, session_id, locale })
    });

    if (!resp.ok || !resp.body) {
      let extra = "";
      try { extra = await resp.text(); } catch (e) {}
      throw new Error(`HTTP ${resp.status}${extra ? " — " + extra : ""}`);
    }

    reader = resp.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");

      let idx;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        if (!frame || frame.startsWith(":")) continue;

        try {
          let eventName = "";
          let data = "";

          const lines = frame.split("\n");
          for (const line of lines) {
            if (line.startsWith("event:")) {
              eventName = line.slice(6);
              if (eventName.startsWith(" ")) eventName = eventName.slice(1);
            }
            if (line.startsWith("data:")) {
              // only remove the single protocol space if present; keep real spaces intact
              let chunk = line.slice(5);
              if (chunk.startsWith(" ")) chunk = chunk.slice(1);
              data += chunk;
            }
          }

          data = data.replace(/\\n/g, "\n");

          if (eventName === "connected") onConnected && onConnected(data);
          else if (eventName === "start") onStart && onStart(data);
          else if (eventName === "token") onToken && onToken(data);
          else if (eventName === "done") onDone && onDone();
          else if (eventName === "error") onError && onError(data || "error");
        } catch (parseErr) {
          onError && onError(`SSE parse error: ${parseErr.message || "unknown"}`);
        }
      }
    }
  } catch (e) {
    onError && onError(e.message || "stream error");
  } finally {
    try { if (reader) reader.releaseLock(); } catch (e) {}
  }
}
