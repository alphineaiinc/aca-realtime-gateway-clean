// ==============================================
// aca-orchestrator/src/index.js
// Orchestrator entry — handles AI intent, DB, and order routes
// ==============================================
const express = require("express");
const path = require("path");
const { createLogger } = require("@shared/logger"); // will move logger here later
const orderRoutes = require("./routes/order");

const app = express();
const logger = createLogger({ level: "info" });

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static TTS folder (for ElevenLabs output)
app.use("/tts", express.static(path.join(__dirname, "public", "tts")));

// Routes
app.use("/brain/order", orderRoutes);

// Health check
app.get("/health", (req, res) => {
  res.json({ ok: true, service: "orchestrator", time: new Date().toISOString() });
});

const PORT = process.env.ORCH_PORT || 8081;
app.listen(PORT, () => {
  logger.info(`✅ Orchestrator running on port ${PORT}`);
  console.log(`✅ Orchestrator running on port ${PORT}`);
});
