const WebSocket = require("ws");
const secret = process.env.WS_SHARED_SECRET || "change_this_to_a_long_random_value";
const ws = new WebSocket(`ws://localhost:8080/media-stream?secret=${secret}`);

ws.on("open", () => console.log("✅ Connected"));
ws.on("message", (msg) => console.log("Received:", msg.toString()));
ws.on("close", () => console.log("❌ Closed"));
ws.on("error", (err) => console.error("Error:", err));
