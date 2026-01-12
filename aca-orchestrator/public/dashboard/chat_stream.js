// public/dashboard/chat_stream.js
// Story 12.5 — Robust SSE reader for /api/chat/stream
// Fixes:
// - Supports AbortController (so UI can cancel safely)
// - Does not trim token data
// - Emits clear errors when aborted

async function streamChatReply({
  token,
  message,
  session_id,
  locale,
  signal,          // AbortController signal (optional)
  onToken,
  onDone,
  onError,
  onConnected,
  onStart
}) {
  let reader;

  try {
    const raw = String(token || "").trim();
    const bearer = raw.startsWith("Bearer ") ? raw : `Bearer ${raw}`;

    const resp = await fetch("/api/chat/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": bearer,
        "Accept": "text/event-stream"
      },
      body: JSON.stringify({ message, session_id, locale }),
      signal
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

        let eventName = "";
        let data = "";

        try {
          const lines = frame.split("\n");
          for (const line of lines) {
            if (line.startsWith("event:")) {
              eventName = line.slice(6);
              if (eventName.startsWith(" ")) eventName = eventName.slice(1);
            }
            if (line.startsWith("data:")) {
              let chunk = line.slice(5);
              if (chunk.startsWith(" ")) chunk = chunk.slice(1); // remove ONLY protocol space
              data += chunk; // preserve real spaces
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
    // AbortError is very common when something cancels the request
    if (e && e.name === "AbortError") {
      onError && onError("Request aborted by browser/client.");
    } else {
      onError && onError(e.message || "stream error");
    }
  } finally {
    try { if (reader) reader.releaseLock(); } catch (e) {}
  }
}
