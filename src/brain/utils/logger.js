// ============================================
// src/brain/utils/logger.js
// Centralized logger factory — supports multiple modules
// ============================================
const path = require("path");
const fs = require("fs");
const winston = require("winston");
require("winston-daily-rotate-file");

// Ensure logs directory exists
const LOG_DIR = path.join(__dirname, "../../logs");
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

// Factory to create per-module loggers
function createLogger(options = {}) {
  const level = options.level || "info";
  const logFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(
      (info) => `${info.timestamp} [${info.level.toUpperCase()}] ${info.message}`
    )
  );

  const transports = [
    new winston.transports.DailyRotateFile({
      filename: path.join(LOG_DIR, "orchestrator-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      maxFiles: "7d",
      zippedArchive: false,
    }),
    new winston.transports.Console(),
  ];

  const logger = winston.createLogger({
    level,
    format: logFormat,
    transports,
  });

  logger.info("🧠 Orchestrator logger initialized");
  return logger;
}

module.exports = { createLogger };
