// ================================
// src/routes/dashboard.js
// Story 2.13 — AI Brain Lifecycle + Confidence Dashboard UI
// Builds on Story 2.11 — adds Brain diagnostics panel
// ================================
const express = require("express");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const router = express.Router();
const LOG_PATH = path.join(__dirname, "../logs/response_tuning.log");

// ----------------------------------------------------
// Serve static dashboard UI
// ----------------------------------------------------
router.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../../public/dashboard/index.html"));
});

// ----------------------------------------------------
// API endpoint — serve parsed adaptive-response log data
// ----------------------------------------------------
router.get("/data", (req, res) => {
  try {
    res.set("Cache-Control", "no-store");

    if (!fs.existsSync(LOG_PATH)) {
      return res.json({ entries: [] });
    }

    const content = fs.readFileSync(LOG_PATH, "utf8");
    const lines = content.trim().split("\n").filter(Boolean).slice(-200);

    const entries = lines
      .map((line) => {
        try {
          const match = line.match(/\[(.*?)\]\s\[(.*?)\]\s(.+)/);
          if (!match) return null;
          return {
            timestamp: match[1],
            level: match[2],
            message: match[3],
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));

    res.json({ entries });
  } catch (err) {
    console.error("Dashboard API error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// NEW — /brain-status endpoint
// Fetches diagnostics from /brain/diagnostics
// so UI can display Brain status, uptime, memory, etc.
// ----------------------------------------------------
router.get("/brain-status", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");

    const response = await axios.get("http://localhost:8080/brain/diagnostics", {
      timeout: 3000,
    });

    const diag = response.data || {};
    return res.json({
      ok: true,
      brain_enabled: diag.brain_enabled ?? false,
      uptime_sec: diag.uptime_sec ?? 0,
      memory_mb: diag.memory_mb ?? 0,
      query_count: diag.query_count ?? 0,
      hostname: diag.hostname ?? "unknown",
    });
  } catch (err) {
    console.error("⚠️ Brain diagnostics fetch failed:", err.message);
    return res.status(500).json({
      ok: false,
      error: "Unable to fetch brain diagnostics",
      details: err.message,
    });
  }
});

module.exports = router;
