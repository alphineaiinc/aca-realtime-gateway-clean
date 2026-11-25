'use strict';
const { randomUUID } = require('node:crypto');
function createStripeEventReceiptStore(pool) {
  if (!pool || typeof pool.query !== 'function') throw new TypeError('Database required');
  return {
    async claim(eventId) {
      if (typeof eventId !== 'string' || !/^evt_[A-Za-z0-9_]{1,200}$/.test(eventId)) throw new TypeError('Invalid event identifier');
      const claimId = randomUUID();
      const result = await pool.query(
        "INSERT INTO stripe_event_receipts(event_id,claim_id,state) VALUES ($1,$2,'processing') ON CONFLICT (event_id) DO NOTHING RETURNING claim_id", [eventId,claimId]);
      if (result.rowCount === 1) return { status: 'claimed', claimId };
      const existing = await pool.query('SELECT state FROM stripe_event_receipts WHERE event_id=$1', [eventId]);
      return { status: existing.rows[0]?.state === 'completed' ? 'completed' : 'blocked' };
    },
    // Read-only reconciliation inventory; caller must enforce operator authorization.
    async listUnresolved(limit = 100) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new TypeError('Invalid reconciliation limit');
      const result = await pool.query("SELECT event_id,state,created_at,updated_at FROM stripe_event_receipts WHERE state IN ('processing','uncertain') ORDER BY updated_at,event_id LIMIT $1", [limit]);
      return result.rows;
    },
    async finish(eventId, claimId, state) {
      if (!['completed','uncertain'].includes(state)) throw new TypeError('Invalid receipt state');
      const result = await pool.query("UPDATE stripe_event_receipts SET state=$3,updated_at=clock_timestamp() WHERE event_id=$1 AND claim_id=$2 AND state='processing'", [eventId,claimId,state]);
      if (result.rowCount !== 1) throw new Error('Receipt ownership lost');
    }
  };
}
module.exports = { createStripeEventReceiptStore };
