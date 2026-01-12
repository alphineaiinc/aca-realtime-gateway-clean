// public/dashboard/chat_stream.js
// Story 12.5 — Robust SSE reader for /api/chat/stream
// FIX: Preserve whitespace (no trim) and prevent parser exceptions that abort the stream.

async function streamChatReply({ token, message, session_id, locale, onToken, onDone, onError, onConnected, onStart }) {
  let reader;

  try {
    const bearer = String(token || "").trim().startsWith("Bearer ")
      ? String(token || "").trim()
      : `Bearer ${String(token || "").trim()}`;

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

      // Normalize CRLF -> LF for stable parsing
      buffer = buffer.replace(/\r\n/g, "\n");

      // Process complete frames (split by blank line)
      let sepIndex;
      while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, sepIndex);
        buffer = buffer.slice(sepIndex + 2);

        // Heartbeats/comments start with ":"
        if (!frame || frame.startsWith(":")) continue;

        // Parse frame lines
        try {
          let eventName = "";
          let data = "";

          const lines = frame.split("\n");
          for (const line of lines) {
            if (line.startsWith("event:")) {
              // keep exact after "event:" then trim single leading space if present
              eventName = line.slice(6);
              if (eventName.startsWith(" ")) eventName = eventName.slice(1);
            } else if (line.startsWith("data:")) {
              // keep exact payload including leading spaces
              let chunk = line.slice(5);
              if (chunk.startsWith(" ")) chunk = chunk.slice(1); // removes only the protocol space
              data += chunk;
            }
          }

          data = data.replace(/\\n/g, "\n");

          if (eventName === "connected") {
            onConnected && onConnected(data);
          } else if (eventName === "start") {
            onStart && onStart(data);
          } else if (eventName === "token") {
            onToken && onToken(data);
          } else if (eventName === "done") {
            onDone && onDone();
          } else if (eventName === "error") {
            onError && onError(data || "error");
          }
        } catch (parseErr) {
          // DO NOT abort the connection due to a parse glitch
          // Just surface it and keep going.
          onError && onError(`SSE parse error: ${parseErr.message || "unknown"}`);
        }
      }
    }
  } catch (e) {
    onError && onError(e.message || "stream error");
  } finally {
    try {
      if (reader) reader.releaseLock();
    } catch (e) {}
  }
}
