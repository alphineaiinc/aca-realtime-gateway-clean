// ==========================================================
// src/brain/utils/logger.js
// Unified Logger: Winston + Analytics (Windows-safe)
// ==========================================================
const winston = require("winston");
require("winston-daily-rotate-file");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ----------------------------------------------------------
// Core Winston Logger (rotating files)
// ----------------------------------------------------------
function createLogger({ level = "info" } = {}) {
  const logDir = path.resolve(__dirname, "../../../logs");
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

  const logFilePattern = path.join(logDir, "orchestrator-%DATE%.log");
  console.log("🧾 Logger writing to:", logFilePattern);

  const transport = new winston.transports.DailyRotateFile({
    filename: logFilePattern,
    datePattern: "YYYY-MM-DD",
    zippedArchive: false,
    maxSize: "10m",
    maxFiles: "14d",
  });

  const logger = winston.createLogger({
    level,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.printf(
        ({ level, message, timestamp }) =>
          `${timestamp} [${level.toUpperCase()}] ${message}`
      )
    ),
    transports: [transport, new winston.transports.Console()],
  });

  logger.info("🧠 Orchestrator logger initialized");
  return logger;
}

// ----------------------------------------------------------
// Instantiate default logger (used by all modules)
// ----------------------------------------------------------
const logger = createLogger({ level: process.env.LOG_LEVEL || "info" });

// ==========================================================
// Story 6.4 — Growth Tracker & Marketing Analytics Logger
// ==========================================================

// --- Helper: safely mask email & phone ---
function maskSensitiveInfo(value) {
  if (!value || typeof value !== "string") return "";
  if (value.includes("@")) {
    const [user, domain] = value.split("@");
    return user.slice(0, 2) + "***@" + domain;
  }
  if (value.startsWith("+")) {
    return value.slice(0, 3) + "******" + value.slice(-2);
  }
  return "***";
}

// --- Append marketing analytics event ---
function logAnalyticsEvent(eventType, payload = {}) {
  try {
    const logDir = path.join(__dirname, "../../../logs");
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

    const file = path.join(logDir, "analytics.log");
    const maskedPayload = {
      ...payload,
      email: maskSensitiveInfo(payload.email),
      contact_number: maskSensitiveInfo(payload.contact_number),
    };

    const entry = {
      id: crypto.randomUUID(),
      ts: new Date().toISOString(),
      event: eventType,
      data: maskedPayload,
    };

    fs.appendFileSync(file, JSON.stringify(entry) + "\n");
  } catch (err) {
    console.error("⚠️ Analytics logging failed:", err.message || err);
  }
}

// ==========================================================
// Exports (Unified Interface)
// ==========================================================
//
// Now any file can safely call:
//   logger.info("...");
//   logger.warn("...");
//   logger.error("...");
//   logAnalyticsEvent("signup", {...});
//
module.exports = Object.assign(logger, {
  createLogger,
  logAnalyticsEvent,
});
