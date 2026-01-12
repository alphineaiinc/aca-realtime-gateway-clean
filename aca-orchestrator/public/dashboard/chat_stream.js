// public/dashboard/chat_stream.js
// Story 12.5 — Stream responses from /api/chat/stream (SSE-style)

async function streamChatReply({ token, message, session_id, locale, onToken, onDone, onError }) {
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
      try {
        extra = await resp.text();
      } catch (e) {}
      throw new Error(`HTTP ${resp.status}${extra ? " — " + extra : ""}`);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE frames separated by double newline
      let idx;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        // ignore comments/heartbeats
        if (!frame || frame.startsWith(":")) continue;

        let event = "message";
        let data = "";

        const lines = frame.split("\n");
        for (const line of lines) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          if (line.startsWith("data:")) data += line.slice(5).trim();
        }

        data = data.replace(/\\n/g, "\n");

        if (event === "token") {
          onToken && onToken(data);
        } else if (event === "done") {
          onDone && onDone();
        } else if (event === "error") {
          onError && onError(data || "error");
        }
      }
    }
  } catch (e) {
    onError && onError(e.message || "stream error");
  }
}
