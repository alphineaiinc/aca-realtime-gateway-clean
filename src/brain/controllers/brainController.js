// ===============================================
// src/brain/controllers/brainController.js
// Story 2.13 — AI Brain Lifecycle Control (Unified)
// Expanded from health-only controller
// Uses shared logger instance (no createLogger)
// ===============================================

const os = require("os");
const process = require("process");
const pool = require("../../../aca-orchestrator/src/db/pool");



const { flags, setFlag } = require("../../../config");
const { logger } = require("../utils/logger");

// Track orchestrator start time for uptime diagnostics
const startTime = Date.now();

/**
 * Health endpoint — always available
 * Reports whether the Brain is enabled.
 */
async function health(req, res) {
  logger.info(`✅ Health check request | reqId=${req.reqId}`);

  return res.json({
    ok: true,
    feature: "ai-brain",
    enabled: !!flags.AI_BRAIN_ENABLED,
    reqId: req.reqId,
  });
}

/**
 * Activate AI Brain — sets runtime flag to true
 */
async function activate(req, res) {
  setFlag("AI_BRAIN_ENABLED", true);
  logger.info(`🧠 Brain activated | reqId=${req.reqId}`);
  return res.json({ ok: true, message: "AI Brain activated", reqId: req.reqId });
}

/**
 * Deactivate AI Brain — sets runtime flag to false
 */
async function deactivate(req, res) {
  setFlag("AI_BRAIN_ENABLED", false);
  logger.warn(`⚫ Brain deactivated | reqId=${req.reqId}`);
  return res.json({ ok: true, message: "AI Brain deactivated", reqId: req.reqId });
}

/**
 * Diagnostics — uptime, memory, CPU, query count
 */
async function diagnostics(req, res) {
  try {
    const uptimeSec = ((Date.now() - startTime) / 1000).toFixed(2);
    const mem = process.memoryUsage();

    const db = await pool.connect();
    const q = await db.query("SELECT COUNT(*) AS total FROM query_history;");
    db.release();

    const diag = {
      ok: true,
      uptime_sec: uptimeSec,
      memory_mb: (mem.rss / 1024 / 1024).toFixed(2),
      brain_enabled: !!flags.AI_BRAIN_ENABLED,
      query_count: Number(q.rows[0].total),
      hostname: os.hostname(),
    };

    logger.info(`📊 Brain diagnostics | reqId=${req.reqId}`, diag);
    return res.json(diag);
  } catch (err) {
    logger.error(`❌ Diagnostics failed | reqId=${req.reqId}`, err);
    return res.status(500).json({ error: "Diagnostics failed", details: err.message });
  }
}

/**
 * Train — add new Q&A pair for fine-tuning
 * (simple safe insert; embedding handled elsewhere)
 */
async function train(req, res) {
  const { business_id, question, answer } = req.body;

  if (!flags.AI_BRAIN_ENABLED)
    return res.status(400).json({ error: "Brain is disabled" });
  if (!business_id || !question || !answer)
    return res.status(400).json({ error: "Missing parameters" });

  try {
    const db = await pool.connect();
    await db.query(
      "INSERT INTO kb_entries (business_id, question, answer) VALUES ($1,$2,$3)",
      [business_id, question, answer]
    );
    db.release();

    logger.info(`📚 New training data added for business ${business_id} | reqId=${req.reqId}`);
    return res.json({ ok: true, message: "Training data added", reqId: req.reqId });
  } catch (err) {
    logger.error(`❌ Training insert failed | reqId=${req.reqId}`, err);
    return res.status(500).json({ error: "Database insert failed" });
  }
}

module.exports = { health, activate, deactivate, diagnostics, train };
