// ===============================================
// shared/config.js
// Unified configuration for Alphine AI services
// ===============================================
const path = require("path");
const dotenv = require("dotenv");
const fs = require("fs");

// Load .env from project root
const ENV_PATH = path.join(__dirname, "../.env");
if (fs.existsSync(ENV_PATH)) dotenv.config({ path: ENV_PATH });

// ---- Core Environment Variables ---- //
const config = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: process.env.PORT || 8080,

  // AI Keys
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
  ELEVENLABS_VOICE_ID: process.env.ELEVENLABS_VOICE_ID,

  // Twilio
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER,

  // Database
  DATABASE_URL: process.env.DATABASE_URL,
  PGUSER: process.env.PGUSER,
  PGPASSWORD: process.env.PGPASSWORD,
  PGHOST: process.env.PGHOST,
  PGPORT: process.env.PGPORT,
  PGDATABASE: process.env.PGDATABASE,

  // Others
  LOG_LEVEL: process.env.LOG_LEVEL || "info"
};

// ---- Feature Flags ---- //
const flags = {
  AI_BRAIN_ENABLED: process.env.AI_BRAIN_ENABLED === "true",
  REDACT_LOG_SENSITIVE: process.env.REDACT_LOG_SENSITIVE === "true",
  ENABLE_TTS: process.env.ENABLE_TTS !== "false", // default true
  ENABLE_DB_LOGGING: process.env.ENABLE_DB_LOGGING !== "false"
};

// ---- Helper ---- //
function showConfigSummary() {
  console.log("🌍 Loaded Environment Configuration:");
  console.table({
    NODE_ENV: config.NODE_ENV,
    OPENAI_API_KEY: !!config.OPENAI_API_KEY,
    ELEVENLABS_API_KEY: !!config.ELEVENLABS_API_KEY,
    TWILIO_ACCOUNT_SID: !!config.TWILIO_ACCOUNT_SID,
    DATABASE_URL: !!config.DATABASE_URL,
    AI_BRAIN_ENABLED: flags.AI_BRAIN_ENABLED
  });
}

module.exports = { config, flags, showConfigSummary };
