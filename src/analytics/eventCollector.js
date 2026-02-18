/**
 * src/analytics/eventCollector.js
 * Epic 12 hardening: safe analytics collector
 * - Must NEVER crash routes if analytics is not configured
 * - Minimizes logging and avoids PII by default
 */

function sanitizeEvent(evt) {
  try {
    if (!evt || typeof evt !== "object") return {};
    const out = {};
    // allow-list only (no raw payload dumps)
    if (evt.event) out.event = String(evt.event).slice(0, 120);
    if (evt.tenant_id != null) out.tenant_id = Number(evt.tenant_id);
    if (evt.partner_id != null) out.partner_id = Number(evt.partner_id);
    if (evt.session_id) out.session_id = String(evt.session_id).slice(0, 128);
    if (evt.ts) out.ts = evt.ts;
    return out;
  } catch (e) {
    return {};
  }
}

async function collectEvent(evt) {
  // Default: no-op (safe). If later you add DB-backed analytics, implement here.
  return { ok: true, stored: false, event: sanitizeEvent(evt) };
}

module.exports = { collectEvent };