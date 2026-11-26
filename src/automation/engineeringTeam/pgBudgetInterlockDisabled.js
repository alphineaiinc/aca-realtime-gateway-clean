'use strict';

const schemaSQL = 'CREATE TABLE da_budget_interlock_disabled (singleton boolean PRIMARY KEY CHECK(singleton), version bigint NOT NULL CHECK(version>=0), pending text);';

async function readInterlock(client, {lock = false} = {}) {
 const result = await client.query('SELECT version,pending FROM da_budget_interlock_disabled WHERE singleton=true' +
  (lock ? ' FOR UPDATE' : ''));
 if (result.rowCount !== 1) throw Error('Missing interlock');
 const {version: raw, pending} = result.rows[0];
 const version = Number(raw);
 if (!/^\d+$/.test(String(raw)) || !Number.isSafeInteger(version) || typeof pending !== 'string' && pending !== null) {
  throw Error('Invalid interlock');
 }
 return {version, pending};
}

async function changeInterlock(client, current, pending, {expiresAt} = {}) {
 const version = current.version + 1;
 if (!Number.isSafeInteger(version)) throw Error('Interlock version exhausted');
 const result = await client.query(
  'UPDATE da_budget_interlock_disabled SET version=$1,pending=$2 WHERE singleton=true AND version=$3 AND pending IS NOT DISTINCT FROM $4' +
   (expiresAt === undefined ? '' : ' AND extract(epoch FROM clock_timestamp()) * 1000 < $5::numeric'),
  expiresAt === undefined ? [version, pending, current.version, current.pending]
   : [version, pending, current.version, current.pending, expiresAt]
 );
 if (result.rowCount !== 1) throw Error('Interlock conflict');
 return {version, pending};
}

// Keep the same physical session across the pending, ledger and clear commits.
async function serialize(pool, work) {
 const client = await pool.connect();
 let discard = true;
 try {
  await client.query('SELECT pg_advisory_lock(172150,189)');
  const result = await work(client);
  const unlocked = await client.query('SELECT pg_advisory_unlock(172150,189) AS unlocked');
  discard = unlocked.rows[0]?.unlocked !== true;
  if (discard) throw Error('Budget lock release uncertain');
  return result;
 } finally {
  client.release(discard);
 }
}

async function transaction(client, work) {
 await client.query('BEGIN');
 try {
  // Wait for local WAL flush before proceeding to the next phase.
  await client.query('SET LOCAL synchronous_commit = on');
  const result = await work();
  await client.query('COMMIT');
  return result;
 } catch (error) {
  try { await client.query('ROLLBACK'); } catch {}
  throw error;
 }
}

async function readLedgers(client, {lock = false} = {}) {
 const result = await client.query('SELECT month,state FROM da_monthly_budget_disabled ORDER BY month' +
  (lock ? ' FOR UPDATE' : ''));
 for (const {month, state} of result.rows) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || state?.month !== month || !Array.isArray(state.entries)) {
   throw Error('Invalid ledger');
  }
 }
 return Object.fromEntries(result.rows.map(({month, state}) => [month, state]));
}

module.exports = {schemaSQL, serialize, transaction, readInterlock, changeInterlock, readLedgers};
