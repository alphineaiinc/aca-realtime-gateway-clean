// ==========================================================
// src/monitor/alertManager.js
// Story 4.Final — Unified Alert Lifecycle + Auto-Cleanup + Recovery Visibility
// Circular-dependency safe version
// ==========================================================

const fs = require("fs");
const path = require("path");

// ----------------------------------------------------------
// Global and per-tenant log paths
// ----------------------------------------------------------
const ALERT_ROOT = path.join(__dirname, "../../logs/alerts");
const GLOBAL_ALERT_LOG = path.join(ALERT_ROOT, "alerts.log");

// Ensure directory exists securely
try {
  if (!fs.existsSync(ALERT_ROOT)) {
    fs.mkdirSync(ALERT_ROOT, { recursive: true });
    console.log("📁 Created alerts directory:", ALERT_ROOT);
  }
} catch (err) {
  console.error("❌ Failed to prepare alert log directory:", err);
}

// ----------------------------------------------------------
// Helpers
// ----------------------------------------------------------
function getTenantLogPath(business_id = null) {
  return business_id == null
    ? GLOBAL_ALERT_LOG
    : path.join(ALERT_ROOT, `tenant-${business_id}.log`);
}

/**
 * Persist an alert entry to its tenant log
 */
function writeAlert(alert) {
  const entry = {
    time: new Date().toISOString(),
    component: alert.component || "system",
    message: alert.message || "No message provided",
    severity: alert.severity || "info",
    level: alert.level || (alert.severity || "info").toLowerCase(),
    source: alert.source || "system",
    business_id: alert.business_id || null,
    status: alert.status || "active",
  };

  const targetPath = getTenantLogPath(entry.business_id);
  try {
    fs.appendFileSync(targetPath, JSON.stringify(entry) + "\n");
    console.log(
      `🚨 ALERT${entry.business_id ? " (tenant " + entry.business_id + ")" : ""}:`,
      `${entry.component} | ${entry.severity.toUpperCase()} | ${entry.message}`
    );
  } catch (err) {
    console.error("⚠️ Failed to write alert log:", err);
  }
  return targetPath;
}

/**
 * Retrieve recent alerts (default: last 25)
 */
function getRecentAlerts(limit = 25, business_id = null) {
  const targetPath = getTenantLogPath(business_id);
  if (!fs.existsSync(targetPath)) return [];

  const lines = fs.readFileSync(targetPath, "utf-8").trim().split("\n");
  return lines.slice(-limit).map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return { time: "?", message: l };
    }
  });
}

/**
 * Send alert + trigger auto-recovery for severe cases
 * (lazy require to avoid circular dependency)
 */
function sendAlert(
  component,
  message,
  severity = "high",
  source = "system",
  business_id = null
) {
  const normalizedComponent = component || `tenant-${business_id || "global"}`;
  const level = (severity || "").toLowerCase();

  const alert = {
    component: normalizedComponent,
    message,
    severity,
    level,
    source,
    business_id,
    status: "active",
  };

  const alertPath = writeAlert(alert);

  console.log(
    `[DEBUG] Sending alert: ${normalizedComponent} | ${severity} | tenant/source=${source || "none"}`
  );
  console.log(`[DEBUG] Alert saved to: ${alertPath}`);

  // 🔧 Auto-Recovery Simulation (lazy require)
  if (["critical", "error", "high"].includes(level)) {
    try {
      const recovery = require("./recoveryManager");
      if (recovery && typeof recovery.simulateRecovery === "function") {
        recovery.simulateRecovery(message, normalizedComponent, business_id);
      } else {
        console.warn("⚠️ simulateRecovery not available (module not ready yet)");
      }
    } catch (err) {
      console.error("Auto-recovery simulation failed:", err);
    }
  }

  return alert;
}

/**
 * Mark an alert as resolved (auto-called by recoveryManager)
 */
function resolveAlert(component, business_id = null, note = "Auto-recovered") {
  const targetPath = getTenantLogPath(business_id);
  const now = new Date().toISOString();

  // 1️⃣ Read existing alerts
  let existing = [];
  try {
    if (fs.existsSync(targetPath)) {
      existing = fs
        .readFileSync(targetPath, "utf-8")
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l));
    }
  } catch (err) {
    console.error("⚠️ Failed to read alerts for resolution:", err);
  }

  // 2️⃣ Mark old active alerts for same component as resolved
  const updated = existing.map((a) =>
    a.component === component && a.status !== "resolved"
      ? { ...a, status: "resolved", resolved_at: now }
      : a
  );

  // 3️⃣ Append new resolved entry
  updated.push({
    time: now,
    component,
    business_id,
    message: note,
    severity: "info",
    status: "resolved",
  });

  // 4️⃣ Write back file
  try {
    fs.writeFileSync(
      targetPath,
      updated.map((a) => JSON.stringify(a)).join("\n") + "\n"
    );
    console.log(`✅ RESOLVED: ${component} (${note}) — previous active alerts cleared`);
  } catch (err) {
    console.error("⚠️ Failed to log resolution:", err);
  }
}

/**
 * Cleanup old alert logs (older than 7 days)
 */
function autoCleanupOldAlerts() {
  const files = fs.readdirSync(ALERT_ROOT).filter((f) => f.endsWith(".log"));
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  files.forEach((file) => {
    const filePath = path.join(ALERT_ROOT, file);
    const lines = fs.readFileSync(filePath, "utf-8").trim().split("\n");
    const recent = lines.filter((l) => {
      try {
        const e = JSON.parse(l);
        return new Date(e.time).getTime() > cutoff;
      } catch {
        return true;
      }
    });
    fs.writeFileSync(filePath, recent.join("\n") + "\n");
  });
}

// Run cleanup periodically (every 12 h)
setInterval(autoCleanupOldAlerts, 12 * 60 * 60 * 1000);

// ----------------------------------------------------------
module.exports = {
  sendAlert,
  getRecentAlerts,
  resolveAlert,
  autoCleanupOldAlerts,
};
// ==========================================================
