// ==========================================================
// src/monitor/monitorRoutes.js
// Story 4.Final — Unified Multi-Tenant Monitoring & Recovery Visibility
// + Fix: Smart Active Alert Count (post-recovery) + Duplicate Variable Patch
// ==========================================================
const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");

const controller = require("./monitorController");
const { getRecentAlerts, sendAlert } = require("./alertManager");
const { getRecentRecoveries, simulateRecovery } = require("./recoveryManager");

// ----------------------------------------------------------
// Runtime Flags
// ----------------------------------------------------------
let AUTO_RECOVERY_ENABLED = true;
const VERSION = "4.Final";

// ----------------------------------------------------------
// Log paths
// ----------------------------------------------------------
const LOG_DIR = path.join(__dirname, "../../logs");
const LOG_FILE = path.join(LOG_DIR, "system.log");
const ALERTS_DIR = path.join(LOG_DIR, "alerts");
const RECOVERIES_DIR = path.join(LOG_DIR, "recoveries");

function tenantAlertFile(id) {
  return path.join(ALERTS_DIR, `tenant-${id}.log`);
}
function tenantRecoveryFile(id) {
  return path.join(RECOVERIES_DIR, `tenant-${id}.json`);
}

// ----------------------------------------------------------
// 🧪 Simulation Utilities
// ----------------------------------------------------------
router.post("/simulate/alert", (req, res) => {
  try {
    const { tenant_id, message, severity } = req.body || {};
    const alert = sendAlert(
      "simulator",
      message || "Simulated critical fault",
      severity || "critical",
      "simulator",
      tenant_id ? parseInt(tenant_id, 10) : null
    );
    res.json({ ok: true, simulated: "alert", alert, version: VERSION });
  } catch (err) {
    console.error("Simulation alert error:", err);
    res.status(500).json({ ok: false, error: "Alert simulation failed" });
  }
});

router.post("/simulate/recovery", (req, res) => {
  try {
    const { issueType, source, tenant_id } = req.body || {};
    const result = simulateRecovery(
      issueType || "test-issue",
      source || "manual",
      tenant_id ? parseInt(tenant_id, 10) : null
    );
    res.json({ ok: true, simulated: "recovery", result, version: VERSION });
  } catch (err) {
    console.error("Simulation recovery error:", err);
    res.status(500).json({ ok: false, error: "Recovery simulation failed" });
  }
});

// ----------------------------------------------------------
// ✅ Root Dashboard Summary
// ----------------------------------------------------------
router.get("/", (req, res) => {
  try {
    const uptime = process.uptime();
    const memory = process.memoryUsage();
    const loadAvg = require("os").loadavg();

    let recentLogs = [];
    if (fs.existsSync(LOG_FILE)) {
      const lines = fs.readFileSync(LOG_FILE, "utf-8").trim().split("\n");
      recentLogs = lines.slice(-30);
    }

    res.json({
      ok: true,
      scope: "global",
      version: VERSION,
      uptime,
      memory,
      loadAvg,
      AUTO_RECOVERY_ENABLED,
      timestamp: new Date().toISOString(),
      recentLogs,
    });
  } catch (err) {
    console.error("Monitor root error:", err);
    res.status(500).json({ ok: false, error: "Monitor root failed" });
  }
});

// ----------------------------------------------------------
// 🧩 Admin Aggregated Monitoring Endpoint
// ----------------------------------------------------------
router.get("/admin", (req, res) => {
  try {
    const tenants = [];

    if (fs.existsSync(ALERTS_DIR)) {
      const files = fs.readdirSync(ALERTS_DIR).filter(f => f.startsWith("tenant-"));

      for (const f of files) {
        const id = parseInt(f.replace("tenant-", "").split(".")[0]);
        if (Number.isNaN(id)) continue;

        const alerts = getRecentAlerts(50, id);
        const recoveries = getRecentRecoveries(50, id);

        // ✅ Find latest recovery timestamp (if any)
        const latestRecoveryTime = recoveries.length
          ? new Date(recoveries[0].timestamp || recoveries[0].time || 0).getTime()
          : 0;

        // ✅ Count only alerts that are unresolved *after* last recovery
        const activeAlertsAfterRecovery = alerts.filter(a => {
          const alertTime = new Date(a.time || a.timestamp || 0).getTime();
          return a.status !== "resolved" && alertTime > latestRecoveryTime;
        });

        tenants.push({
          business_id: id,
          active_alerts: activeAlertsAfterRecovery.length,
          total_alerts: alerts.length,
          recoveries: recoveries.length,
          last_alert: alerts.at(-1)?.message || "None",
        });
      }
    }

    res.json({
      ok: true,
      scope: "admin",
      version: VERSION,
      total_tenants: tenants.length,
      tenants,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Admin summary error:", err);
    res.status(500).json({ ok: false, error: "Admin summary failed" });
  }
});

// ----------------------------------------------------------
// 🧩 Aggregated Endpoint (active vs resolved counts)
// ----------------------------------------------------------
router.get("/admin/aggregate", (req, res) => {
  try {
    const tenants = [];
    if (fs.existsSync(ALERTS_DIR)) {
      const files = fs.readdirSync(ALERTS_DIR).filter(f => f.startsWith("tenant-"));
      for (const f of files) {
        const id = parseInt(f.replace("tenant-", "").split(".")[0]);
        if (Number.isNaN(id)) continue;
        const alerts = getRecentAlerts(50, id);
        const recoveries = getRecentRecoveries(50, id);
        const active = alerts.filter(a => a.status !== "resolved");
        const resolved = alerts.filter(a => a.status === "resolved");
        tenants.push({
          business_id: id,
          active_alerts: active.length,
          resolved_alerts: resolved.length,
          recovery_count: recoveries.length,
        });
      }
    }
    res.json({
      ok: true,
      version: VERSION,
      auto_recovery_enabled: AUTO_RECOVERY_ENABLED,
      tenants: tenants.length,
      data: tenants,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Aggregate error:", err);
    res.status(500).json({ ok: false, error: "Aggregate failed" });
  }
});

// ----------------------------------------------------------
// 📊 Unified Tenant Overview
// ----------------------------------------------------------
router.get("/overview", (req, res) => {
  try {
    const tenant_id = req.query.tenant_id ? parseInt(req.query.tenant_id, 10) : null;
    const alerts = getRecentAlerts(50, tenant_id);
    const recoveries = getRecentRecoveries(50, tenant_id);

    const activeAlerts = alerts.filter(a => a.status !== "resolved");
    const resolvedAlerts = alerts.filter(a => a.status === "resolved");

    res.json({
      ok: true,
      version: VERSION,
      tenant_id: tenant_id || "global",
      auto_recovery_enabled: AUTO_RECOVERY_ENABLED,
      active_alerts: activeAlerts.length,
      resolved_alerts: resolvedAlerts.length,
      recovery_count: recoveries.length,
      latest_alerts: alerts.slice(-5).reverse(),
      latest_recoveries: recoveries.slice(-5).reverse(),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Overview error:", err);
    res.status(500).json({ ok: false, error: "Overview failed" });
  }
});

// ----------------------------------------------------------
// 🔄 Lightweight Admin Poll Endpoint
// ----------------------------------------------------------
router.get("/admin/status", (req, res) => {
  try {
    res.json({
      ok: true,
      version: VERSION,
      auto_recovery_enabled: AUTO_RECOVERY_ENABLED,
      time: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Status failed" });
  }
});

// ----------------------------------------------------------
// 🧩 Serve Dashboards
// ----------------------------------------------------------
router.get("/dashboard/business/:business_id/monitor.html", (req, res) => {
  const filePath = path.join(__dirname, "../../public/dashboard/monitor.html");
  if (!fs.existsSync(filePath))
    return res.status(404).send("Monitor dashboard not found.");
  res.sendFile(filePath);
});

router.get("/dashboard/admin/monitor.html", (req, res) => {
  const filePath = path.join(__dirname, "../../public/dashboard/admin-monitor.html");
  if (!fs.existsSync(filePath))
    return res.status(404).send("Admin dashboard not found.");
  res.sendFile(filePath);
});

router.get("/admin-monitor", (req, res) => {
  const filePath = path.join(__dirname, "../../public/dashboard/admin-monitor.html");
  if (!fs.existsSync(filePath))
    return res.status(404).send("Admin dashboard not found.");
  res.sendFile(filePath);
});

// ----------------------------------------------------------
// ⚙️ Health & Metrics passthrough
// ----------------------------------------------------------
router.get("/health", (req, res) => {
  if (controller && typeof controller.health === "function")
    return controller.health(req, res);
  res.json({ ok: true, version: VERSION, status: "healthy" });
});

router.get("/metrics", (req, res) => {
  if (controller && typeof controller.metrics === "function")
    return controller.metrics(req, res);
  res.json({
    ok: true,
    version: VERSION,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});

// ----------------------------------------------------------
// ⚙️ Runtime Toggles
// ----------------------------------------------------------
router.post("/recovery/toggle", (req, res) => {
  try {
    AUTO_RECOVERY_ENABLED = !AUTO_RECOVERY_ENABLED;
    console.log("🔁 Auto-Recovery Toggled:", AUTO_RECOVERY_ENABLED);
    res.json({ ok: true, version: VERSION, auto_recovery: AUTO_RECOVERY_ENABLED });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Toggle failed" });
  }
});

// ----------------------------------------------------------
module.exports = router;
// ==========================================================
