// ============================================
// src/monitor/monitorController.js — Story 4.0
// Runtime Health & Metrics Controller
// ============================================
const os = require("os");
const { flags } = require("../../config");
const startTime = Date.now();

exports.health = (req, res) => {
  res.json({
    ok: true,
    uptime_sec: (Date.now() - startTime) / 1000,
    timestamp: new Date().toISOString(),
    flags
  });
};

exports.metrics = (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    cpu_load: os.loadavg(),
    memory_mb: (mem.rss / 1024 / 1024).toFixed(2),
    node_version: process.version,
    platform: os.platform(),
    uptime_sec: process.uptime().toFixed(0),
    active_flags: Object.entries(flags)
      .filter(([_, v]) => v === true)
      .map(([k]) => k)
  });
};
