// ================================
// src/monitor/routes.js
// Story 4.3 — Centralized Monitoring API
// ================================
const express = require("express");
const os = require("os");
const fs = require("fs");
const path = require("path");
const router = express.Router();

const LOG_DIR = path.join(__dirname, "..", "logs");
const START_TIME = Date.now();

function getUptime() {
  const diff = Date.now() - START_TIME;
  const sec = Math.floor(diff / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}h ${m}m ${s}s`;
}

function readRecentLogs(limit = 50) {
  try {
    const files = fs.readdirSync(LOG_DIR)
      .filter(f => f.endsWith(".log"))
      .sort((a, b) =>
        fs.statSync(path.join(LOG_DIR, b)).mtimeMs -
        fs.statSync(path.join(LOG_DIR, a)).mtimeMs
      );
    const latestFile = path.join(LOG_DIR, files[0]);
    const lines = fs.readFileSync(latestFile, "utf-8")
      .split("\n")
      .filter(Boolean);
    return lines.slice(-limit);
  } catch (e) {
    return [`Error reading logs: ${e.message}`];
  }
}

router.get("/", async (req, res) => {
  const mem = process.memoryUsage();
  const cpus = os.loadavg();
  const uptime = getUptime();

  const stats = {
    ok: true,
    uptime,
    memory: {
      rss: (mem.rss / 1024 / 1024).toFixed(2) + " MB",
      heapUsed: (mem.heapUsed / 1024 / 1024).toFixed(2) + " MB",
    },
    loadAvg: cpus.map(n => n.toFixed(2)),
    timestamp: new Date().toISOString(),
    recentLogs: readRecentLogs(20),
  };

  res.json(stats);
});

module.exports = router;
