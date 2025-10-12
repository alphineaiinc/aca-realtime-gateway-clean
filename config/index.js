// ===============================================
// config/index.js
// Unified 12-factor configuration surface for ACA
// Updated for Story 4.0 — Runtime Flags Reload & Monitoring
// ===============================================
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { createLogger } = require("../src/brain/utils/logger");

const logger = createLogger({ level: process.env.LOG_LEVEL || "info" });

// -----------------------------------------------
// Runtime Flags Management
// -----------------------------------------------
const FLAGS_PATH = path.join(__dirname, "flags_state.json");

// Load flags from JSON file
let flags = {};
function loadFlags() {
  try {
    const raw = fs.readFileSync(FLAGS_PATH, "utf8");
    flags = JSON.parse(raw);
    logger.info("♻️ Runtime flags reloaded successfully");
  } catch (err) {
    logger.error("❌ Failed to load runtime flags: " + err.message);
  }
}

// Allow updates in memory + persist to file
function setFlag(key, value) {
  flags[key] = value;
  try {
    fs.writeFileSync(FLAGS_PATH, JSON.stringify(flags, null, 2), "utf8");
    logger.info(`🔧 Runtime flag updated: ${key} = ${value}`);
  } catch (err) {
    logger.error(`❌ Failed to persist flag change (${key}): ${err.message}`);
  }
}

// Initial load
loadFlags();

// Auto-reload every 60 seconds
setInterval(loadFlags, 60000);

// -----------------------------------------------
// Required ENV helper
// -----------------------------------------------
const required = (name) => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
};

// -----------------------------------------------
// Unified configuration export
// -----------------------------------------------
module.exports = {
  env: process.env.APP_ENV || "development",
  port: parseInt(process.env.APP_PORT || "8080", 10),

  // Feature flags & dynamic setter
  flags,
  setFlag,

  logging: {
    level: process.env.LOG_LEVEL || "info",
    redactSensitive: flags.REDACT_LOG_SENSITIVE,
  },

  security: {
    wsSharedSecret: required("WS_SHARED_SECRET"),
  },
};
