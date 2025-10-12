// ==========================================================
// src/monitor/recoveryManager.js
// Story 4.Final — Unified Recovery Lifecycle + Auto-Resolve Integration
// Extends Story 4.7 — Tenant-Scoped Recoveries + Auto-Recovery Continuity
// ==========================================================

const fs = require("fs");
const path = require("path");
const { resolveAlert } = require("./alertManager");

// ----------------------------------------------------------
// Global and per-tenant recovery log paths
// ----------------------------------------------------------
const RECOVERY_ROOT = path.join(__dirname, "../../logs/recoveries");
const GLOBAL_RECOVERY_LOG = path.join(RECOVERY_ROOT, "recovery_log.json");

// Ensure directory exists
try {
  if (!fs.existsSync(RECOVERY_ROOT)) {
    fs.mkdirSync(RECOVERY_ROOT, { recursive: true });
    console.log("📁 Created recoveries directory:", RECOVERY_ROOT);
  }
} catch (err) {
  console.error("❌ Failed to prepare recovery log directory:", err);
}

// ----------------------------------------------------------
// Helpers
// ----------------------------------------------------------
function getTenantFile(business_id = null) {
  return business_id == null
    ? GLOBAL_RECOVERY_LOG
    : path.join(RECOVERY_ROOT, `tenant-${business_id}.json`);
}

function readRecoveries(file) {
  if (!fs.existsSync(file)) return [];
  try {
    const data = fs.readFileSync(file, "utf8");
    return JSON.parse(data);
  } catch (err) {
    console.error("⚠️ Failed to parse recovery log:", err);
    return [];
  }
}

// ----------------------------------------------------------
// Core logging
// ----------------------------------------------------------
function logRecovery(event, business_id = null) {
  try {
    if (!fs.existsSync(RECOVERY_ROOT))
      fs.mkdirSync(RECOVERY_ROOT, { recursive: true });

    const file = getTenantFile(business_id);
    if (!fs.existsSync(file)) fs.writeFileSync(file, "[]");

    const recoveries = readRecoveries(file);
    const record = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      ...event,
      business_id,
      status: event.success ? "success" : "failed",
    };

    recoveries.unshift(record);
    fs.writeFileSync(file, JSON.stringify(recoveries.slice(0, 100), null, 2));

    console.log(
      `🛠️ Recovery${business_id ? " (tenant " + business_id + ")" : ""}:`,
      record
    );
    return record;
  } catch (err) {
    console.error("⚠️ Failed to write recovery log:", err);
    return null;
  }
}

// ----------------------------------------------------------
// Simulation: perform auto-recovery and mark alert resolved
// ----------------------------------------------------------
function simulateRecovery(issueType, source, business_id = null) {
  console.log(
    `⚙️ Simulating recovery for ${issueType} from ${source}${
      business_id ? " (tenant " + business_id + ")" : ""
    }`
  );
  try {
    const success = Math.random() > 0.1;
    const action = success
      ? "Restarted component successfully"
      : "Manual intervention required";

    const result = logRecovery(
      { issueType, source, action, success },
      business_id
    );

    if (result) {
      console.log(
        `♻️ Auto-recovery logged for ${source}${
          business_id ? " tenant " + business_id : ""
        }`
      );
      // 🔄 Auto-resolve related alert
      if (success) resolveAlert(source, business_id, "Recovered automatically");
    }
    return result;
  } catch (err) {
    console.error("❌ simulateRecovery error:", err);
    return null;
  }
}

// ----------------------------------------------------------
// Retrieve recent recoveries (default: 25)
// ----------------------------------------------------------
function getRecentRecoveries(limit = 25, business_id = null) {
  try {
    const file = getTenantFile(business_id);
    const recoveries = readRecoveries(file);
    return recoveries.slice(0, limit);
  } catch (err) {
    console.error("⚠️ Failed to get recoveries:", err);
    return [];
  }
}

// ----------------------------------------------------------
// Cleanup old entries (older than 7 days)
// ----------------------------------------------------------
function cleanupOldRecoveries() {
  const files = fs.readdirSync(RECOVERY_ROOT).filter((f) => f.endsWith(".json"));
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  files.forEach((file) => {
    const filePath = path.join(RECOVERY_ROOT, file);
    const list = readRecoveries(filePath).filter((r) => {
      try {
        return new Date(r.timestamp).getTime() > cutoff;
      } catch {
        return true;
      }
    });
    fs.writeFileSync(filePath, JSON.stringify(list, null, 2));
  });
}

// Periodic cleanup every 12 h
setInterval(cleanupOldRecoveries, 12 * 60 * 60 * 1000);

// ----------------------------------------------------------
module.exports = {
  simulateRecovery,
  getRecentRecoveries,
  logRecovery,
  cleanupOldRecoveries,
};
// ==========================================================
