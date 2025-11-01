// src/analytics/eventCollector.js
// -------------------------------------------------------------
// Alphine AI – Unified Analytics Event Collector (Story 11.1)
// -------------------------------------------------------------
const fs = require("fs");
const path = require("path");
const pool = require("../db/pool");

const LOG_PATH = path.resolve(__dirname, "../logs/audit/analytics_event.log");
if (!fs.existsSync(path.dirname(LOG_PATH))) {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
}

/**
 * recordEvent(evt)
 * Safely logs an analytics event to Postgres + local audit log.
 */
async function recordEvent(evt = {}) {
  const safe = {
    tenant_id: evt.tenant_id ?? null,
    partner_id: evt.partner_id ?? null,
    event_type: evt.event_type ?? "misc",
    quantity: evt.quantity ?? 0,
    unit: evt.unit ?? "",
    cost: evt.cost ?? 0,
    meta: evt.meta ?? {}
  };

  try {
    await pool.query(
      `INSERT INTO analytics_events
        (tenant_id, partner_id, event_type, quantity, unit, cost, meta)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        safe.tenant_id,
        safe.partner_id,
        safe.event_type,
        safe.quantity,
        safe.unit,
        safe.cost,
        safe.meta
      ]
    );
  } catch (err) {
    fs.appendFileSync(
      LOG_PATH,
      `[${new Date().toISOString()}] DB_FAIL ${err.message}\n`
    );
  }

  fs.appendFileSync(
    LOG_PATH,
    `[${new Date().toISOString()}] ${JSON.stringify(safe)}\n`
  );
}

module.exports = { recordEvent };
