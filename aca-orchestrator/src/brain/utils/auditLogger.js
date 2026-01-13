// src/brain/utils/auditLogger.js
const fs = require("fs");
const path = require("path");

const AUDIT_DIR = path.join(__dirname, "../../logs");
const AUDIT_FILE = path.join(AUDIT_DIR, "audit_ws.log");

// Ensure log dir exists (Render safe)
function ensureDir() {
  try {
    if (!fs.existsSync(AUDIT_DIR)) fs.mkdirSync(AUDIT_DIR, { recursive: true });
  } catch (e) {
    // fail-closed on directory creation? No: we should not break chat if audit logging fails.
  }
}

/**
 * Writes one JSON line per event.
 * IMPORTANT: Do not include raw message content.
 */
function audit(event) {
  try {
    ensureDir();
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      ...event,
    });
    fs.appendFileSync(AUDIT_FILE, line + "\n");
  } catch (e) {
    // Do not throw; audit must never break chat.
  }
}

module.exports = { audit };
