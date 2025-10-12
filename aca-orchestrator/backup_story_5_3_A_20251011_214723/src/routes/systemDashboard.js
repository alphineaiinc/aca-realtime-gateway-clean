// ===============================================
// systemDashboard.js
// Story 4.1 — System Alerts & Dashboard Panel
// Provides data endpoints for system.html
// ===============================================
const express = require("express");
const fs = require("fs");
const path = require("path");
const os = require("os");
const router = express.Router();
const { flags } = require("../../../config");

// --- Route: serve dashboard HTML page ---
router.get("/", (req, res) => {
  const filePath = path.join(__dirname, "../../public/dashboard/system.html");
  res.sendFile(filePath);
});

// --- Route: metrics + alert evaluation (Story 4.2) ---
router.get("/data", async (req, res) => {
  try {
    const mem = process.memoryUsage();
    const logDir = path.join(__dirname, "../../logs");
    const latestLogFile = fs
      .readdirSync(logDir)
      .filter((f) => f.startsWith("orchestrator-"))
      .sort()
      .pop();

    let logTail = [];
    if (latestLogFile) {
      const logPath = path.join(logDir, latestLogFile);
      const lines = fs.readFileSync(logPath, "utf8").trim().split("\n");
      logTail = lines.slice(-10);
    }

    const cpu = os.loadavg()[0];
    const memMb = mem.rss / 1024 / 1024;

    // --- Simple health grading ---
    let status = "healthy";
    const alerts = [];

    if (memMb > 1800) {
      status = "critical";
      alerts.push(`Memory usage high (${memMb.toFixed(0)} MB)`);
    } else if (memMb > 1200) {
      status = "warning";
      alerts.push(`Memory usage warning (${memMb.toFixed(0)} MB)`);
    }

    if (cpu > 2.5) {
      status = "critical";
      alerts.push(`CPU load high (${cpu.toFixed(2)})`);
    } else if (cpu > 1.5 && status !== "critical") {
      status = "warning";
      alerts.push(`CPU load elevated (${cpu.toFixed(2)})`);
    }

    if (!flags.AI_BRAIN_ENABLED || !flags.ORDER_FLOW_ENABLED) {
      status = "warning";
      alerts.push("One or more modules disabled");
    }

    res.json({
      uptime_sec: process.uptime().toFixed(0),
      platform: os.platform(),
      node_version: process.version,
      cpu_load: os.loadavg(),
      memory_mb: memMb.toFixed(2),
      flags,
      logs: logTail,
      timestamp: new Date().toISOString(),
      status,
      alerts,
    });
  } catch (err) {
    res.status(500).json({ error: "metrics read failed", details: err.message });
  }
});

module.exports = router;
