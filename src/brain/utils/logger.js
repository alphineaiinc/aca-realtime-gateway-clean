// ==========================================
// aca-orchestrator/src/brain/utils/logger.js
// Winston logger with daily rotate (Windows-safe)
// ==========================================
const winston = require("winston");
require("winston-daily-rotate-file");
const fs = require("fs");
const path = require("path");

function createLogger({ level = "info" } = {}) {
  // ✅ move outside /src to real logs directory
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

module.exports = { createLogger };
