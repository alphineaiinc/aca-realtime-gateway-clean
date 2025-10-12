// ===============================================
// src/brain/analytics.js
// Story 2.12 — Analytics Summary API for ACA
// Aggregates ACA query and tuning metrics from logs
// ===============================================
const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();

const CONF_LOG = path.join(__dirname, "logs", "confidence.log");
const TUNE_LOG = path.join(__dirname, "logs", "response_tuning.log");

// ---- helper to safely read lines ----
function readLogLines(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const data = fs.readFileSync(filePath, "utf8");
    return data.trim().split("\n").filter(Boolean);
  } catch (err) {
    console.error("Error reading log:", err);
    return [];
  }
}

// ---- compute analytics summary ----
function computeSummary() {
  const confidenceLines = readLogLines(CONF_LOG);
  const tuningLines = readLogLines(TUNE_LOG);

  const confidenceValues = [];
  const perBusinessStats = {};

  confidenceLines.forEach(line => {
    const match = line.match(/business_id=(\d+).*confidence=([0-9.]+)/);
    if (match) {
      const bizId = match[1];
      const conf = parseFloat(match[2]);
      confidenceValues.push(conf);
      if (!perBusinessStats[bizId]) perBusinessStats[bizId] = { queries: 0, avg_conf: 0 };
      perBusinessStats[bizId].queries++;
      perBusinessStats[bizId].avg_conf += conf;
    }
  });

  for (const id in perBusinessStats) {
    const biz = perBusinessStats[id];
    biz.avg_conf = parseFloat((biz.avg_conf / biz.queries).toFixed(2));
  }

  const totalQueries = confidenceValues.length;
  const avgConfidence = totalQueries
    ? parseFloat((confidenceValues.reduce((a, b) => a + b, 0) / totalQueries).toFixed(2))
    : 0;

  const totalTunings = tuningLines.length;

  return {
    totalQueries,
    avgConfidence,
    totalTunings,
    perBusinessStats,
  };
}

// ---- route definition ----
router.get("/", (req, res) => {
  try {
    const summary = computeSummary();
    res.json({
      status: "ok",
      generated_at: new Date().toISOString(),
      ...summary,
    });
  } catch (err) {
    console.error("Analytics error:", err);
    res.status(500).json({ error: "Failed to compute analytics" });
  }
});

module.exports = router;
