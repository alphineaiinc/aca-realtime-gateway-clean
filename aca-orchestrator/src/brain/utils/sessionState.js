// src/brain/utils/sessionState.js
const fs = require("fs");
const path = require("path");

const SNAP_DIR = path.join(__dirname, "../../logs/sessions");
if (!fs.existsSync(SNAP_DIR)) fs.mkdirSync(SNAP_DIR, { recursive: true });

const SNAP_FILE = path.join(SNAP_DIR, "snapshot.json");

// Redact any sensitive values before writing to disk.
function redact(obj) {
  const s = JSON.stringify(obj, (k, v) => {
    if (typeof v === "string" && /api_key|secret|token/i.test(k)) return "***";
    return v;
  }, 2);
  return JSON.parse(s);
}

function save(state) {
  try {
    fs.writeFileSync(SNAP_FILE, JSON.stringify(redact(state), null, 2), "utf8");
  } catch (e) {
    console.error("Failed to save session snapshot:", e.message);
  }
}

function load() {
  try {
    if (!fs.existsSync(SNAP_FILE)) return null;
    const raw = fs.readFileSync(SNAP_FILE, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    console.error("Failed to load session snapshot:", e.message);
    return null;
  }
}

function prune(maxFiles = 5) {
  // Simple retention policy (single file now; placeholder for multi-rotations)
  return;
}

module.exports = { save, load, prune, SNAP_FILE };
