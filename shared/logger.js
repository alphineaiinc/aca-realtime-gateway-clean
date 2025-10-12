// ===============================================
// shared/logger.js
// Centralized Winston logger for Alphine AI services
// ===============================================
const winston = require("winston");
const DailyRotateFile = require("winston-daily-rotate-file");
const path = require("path");
const fs = require("fs");

const LOG_DIR = path.join(__dirname, "../logs");

// Ensure the log directory exists
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function createLogger(options = {}) {
  const level = options.level || "info";

  const transportConsole = new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.printf(({ level, message, timestamp }) => {
        return `${timestamp} [${level}] ${message}`;
      })
    ),
  });

  const transportFile = new DailyRotateFile({
    filename: path.join(LOG_DIR, "orchestrator-%DATE%.log"),
    datePattern: "YYYY-MM-DD",
    zippedArchive: false,
    maxSize: "10m",
    maxFiles: "14d",
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.printf(({ level, message, timestamp }) => {
        return `${timestamp} [${level.toUpperCase()}] ${message}`;
      })
    ),
  });

  const logger = winston.createLogger({
    level,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.printf(({ level, message, timestamp }) => {
        return `${timestamp} [${level.toUpperCase()}] ${message}`;
      })
    ),
    transports: [transportFile, transportConsole],
  });

  logger.info(`🧾 Logger initialized — writing to ${LOG_DIR}`);
  return logger;
}

module.exports = { createLogger };
