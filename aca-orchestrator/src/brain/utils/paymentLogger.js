// src/brain/utils/paymentLogger.js
const fs = require("fs");
const path = require("path");

const logDir = path.join(__dirname, "../../logs/billing");
fs.mkdirSync(logDir, { recursive: true });

function logPayment(entry) {
  const file = path.join(logDir, `${new Date().toISOString().slice(0,10)}.log`);
  try {
    fs.appendFileSync(file, JSON.stringify(entry) + "\n");
  } catch (err) {
    console.error("[paymentLogger] write failed:", err.message);
  }
}

module.exports = { logPayment };
