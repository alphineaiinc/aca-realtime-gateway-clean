'use strict';
// Draft primitive, not mounted. Requires a dedicated PostgreSQL client and a
// transaction-pooling compatible design. No lease expiry or automatic takeover.
const { createHash } = require('node:crypto');
async function acquireUploadAdmission(client, tenantId, slots = 4) {
  if (!client || typeof client.query !== 'function' || typeof tenantId !== 'string' ||
      !tenantId.trim() || tenantId.length > 256 || !Number.isSafeInteger(slots) || slots !== 4) {
    throw new TypeError('Invalid upload admission configuration');
  }
  // Use a transaction-scoped lock held for the entire operation by the caller.
  // The caller MUST begin a dedicated transaction and roll it back on all exits.
  // Never use pool.query or release a client while a protected operation runs.
  const key = createHash('sha256').update(tenantId).digest().readInt32BE(0);
  const tenant = await client.query('SELECT pg_try_advisory_xact_lock($1::integer,$2::integer) AS acquired', [180421, key]);
  if (tenant.rows[0]?.acquired !== true) return false;
  for (let slot = 0; slot < slots; slot++) {
    const result = await client.query('SELECT pg_try_advisory_xact_lock($1::integer,$2::integer) AS acquired', [180422, slot]);
    if (result.rows[0]?.acquired === true) return true;
  }
  // Caller rolls back immediately, including the acquired tenant lock.
  return false;
}
// Own the transaction lifecycle. The callback must finish all protected work
// before returning; it must not retain the client or start detached work.
async function withUploadAdmission(pool, tenantId, work) {
  if (!pool || typeof pool.connect !== 'function' || typeof work !== 'function') throw new TypeError('Invalid admission owner');
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query('BEGIN');
    if (!await acquireUploadAdmission(client, tenantId)) return { admitted: false };
    return { admitted: true, result: await work() };
  } catch (error) {
    discard = true;
    throw error;
  } finally {
    try { await client.query('ROLLBACK'); }
    catch (error) { discard = true; throw error; }
    finally { client.release(discard); }
  }
}
module.exports = { acquireUploadAdmission, withUploadAdmission };
