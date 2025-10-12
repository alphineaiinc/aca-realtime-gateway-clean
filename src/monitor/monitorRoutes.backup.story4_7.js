// ==========================================================
// src/monitor/monitorRoutes.js
// Epic 4 Final — Unified Monitoring, Alerts, Auto-Recovery & Admin Controls
// + Story 4.6 — Business Dashboard Visibility & Filtered Alerts
// ==========================================================
const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");

const controller = require("./monitorController");
const { getRecentAlerts, sendAlert } = require("./alertManager");
const { getRecentRecoveries } = require("./recoveryManager");

// ----------------------------------------------------------
// Runtime Flags
// ----------------------------------------------------------
let AUTO_RECOVERY_ENABLED = true; // toggled by admin panel

// Log path for recent system logs (for dashboard)
const LOG_DIR = path.join(__dirname, "../../logs");
const LOG_FILE = path.join(LOG_DIR, "system.log");

// ----------------------------------------------------------
// ✅ Root Dashboard Endpoint
// ----------------------------------------------------------
// Returns a combined JSON used by /dashboard/monitor.html
router.get("/", async (req, res) => {
  try {
    // Gather system info
    const uptime = process.uptime();
    const memory = process.memoryUsage();
    const loadAvg = require("os").loadavg();

    // Read recent logs (last ~30 lines)
    let recentLogs = [];
    if (fs.existsSync(LOG_FILE)) {
      const lines = fs.readFileSync(LOG_FILE, "utf-8").trim().split("\n");
      recentLogs = lines.slice(-30);
    }

    res.json({
      ok: true,
      uptime,
      memory,
      loadAvg,
      timestamp: new Date().toISOString(),
      recentLogs,
    });
  } catch (err) {
    console.error("Error in /monitor root:", err);
    res.status(500).json({ ok: false, error: "Monitor root failed" });
  }
});

// ----------------------------------------------------------
// ✅ Core Monitoring APIs
// ----------------------------------------------------------

// Health check — always available (prevents 404)
router.get("/health", (req, res) => {
  try {
    if (controller && typeof controller.health === "function") {
      return controller.health(req, res);
    }
    return res.json({
      ok: true,
      feature: "system-monitor",
      status: "healthy",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Health endpoint error:", err);
    res.status(500).json({ ok: false, error: "Health check failed" });
  }
});

// Metrics endpoint — reports uptime and memory
router.get("/metrics", (req, res) => {
  try {
    if (controller && typeof controller.metrics === "function") {
      return controller.metrics(req, res);
    }
    res.json({
      ok: true,
      feature: "system-monitor",
      metrics: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      },
    });
  } catch (err) {
    console.error("Metrics endpoint error:", err);
    res.status(500).json({ ok: false, error: "Metrics check failed" });
  }
});

// ----------------------------------------------------------
// 🔔 Alert Management APIs
// ----------------------------------------------------------

// Fetch recent alerts (default: last 25)
router.get("/alerts", (req, res) => {
  try {
    const alerts = getRecentAlerts();
    res.json({ ok: true, count: alerts.length, alerts });
  } catch (err) {
    console.error("Error reading alerts:", err);
    res.status(500).json({ ok: false, error: "Failed to read alerts" });
  }
});

// ✅ NEW: Fetch alerts for a specific business (Story 4.6)
router.get("/business/:business_id/alerts", (req, res) => {
  try {
    const business_id = parseInt(req.params.business_id);
    if (isNaN(business_id)) {
      return res.status(400).json({ ok: false, error: "Invalid business_id" });
    }

    const alerts = getRecentAlerts(50, business_id); // last 50 entries
    res.json({ ok: true, count: alerts.length, alerts });
  } catch (err) {
    console.error("Error reading business alerts:", err);
    res.status(500).json({ ok: false, error: "Failed to read business alerts" });
  }
});

// Manual test alert (for validation)
router.post("/alerts/test", (req, res) => {
  try {
    sendAlert(
      "manual-test",
      "Simulated alert via /monitor/alerts/test",
      "high",
      "manual"
    );
    res.json({ ok: true, message: "Test alert recorded" });
  } catch (err) {
    console.error("Error writing alert:", err);
    res.status(500).json({ ok: false, error: "Failed to write alert" });
  }
});

// ----------------------------------------------------------
// 🛠️ Recovery Report API
// ----------------------------------------------------------
router.get("/recoveries", (req, res) => {
  try {
    const recoveries = getRecentRecoveries();
    res.json({ ok: true, count: recoveries.length, recoveries });
  } catch (err) {
    console.error("Error reading recoveries:", err);
    res.status(500).json({ ok: false, error: "Failed to read recoveries" });
  }
});

// ----------------------------------------------------------
// ⚙️ Admin / Runtime Control APIs
// ----------------------------------------------------------

// Toggle Auto-Recovery Flag
router.post("/recovery/toggle", (req, res) => {
  try {
    AUTO_RECOVERY_ENABLED = !AUTO_RECOVERY_ENABLED;
    console.log("🔁 Auto-Recovery Toggled:", AUTO_RECOVERY_ENABLED);
    res.json({ ok: true, auto_recovery: AUTO_RECOVERY_ENABLED });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Toggle failed" });
  }
});

// Clear alerts or recovery logs
const ALERT_LOG_PATH = path.join(__dirname, "../../logs/alerts.log");
const RECOVERY_LOG_PATH = path.join(__dirname, "recovery_log.json");

router.post("/clear/:type", (req, res) => {
  const t = req.params.type;
  try {
    if (t === "alerts" && fs.existsSync(ALERT_LOG_PATH)) {
      fs.writeFileSync(ALERT_LOG_PATH, "");
    } else if (t === "recoveries" && fs.existsSync(RECOVERY_LOG_PATH)) {
      fs.writeFileSync(RECOVERY_LOG_PATH, "[]");
    } else {
      return res.status(400).json({ ok: false, error: "Unknown log type" });
    }
    console.log(`🧹 Cleared ${t} log`);
    res.json({ ok: true, cleared: t });
  } catch (err) {
    console.error("Error clearing logs:", err);
    res.status(500).json({ ok: false, error: "Failed to clear logs" });
  }
});

// ----------------------------------------------------------
module.exports = router;
// ==========================================================
