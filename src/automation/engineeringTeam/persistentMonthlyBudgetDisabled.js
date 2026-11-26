'use strict';

const {randomUUID} = require('node:crypto');
const {reserveLiabilities} = require('./aggregateMonthlyBudgetDisabled');
const {ledgerDigest} = require('./budgetEvidenceDisabled');
const {serialize, transaction, readInterlock, changeInterlock, readLedgers} = require('./pgBudgetInterlockDisabled');

const schemaSQL = 'CREATE TABLE da_monthly_budget_disabled (month text PRIMARY KEY, state jsonb NOT NULL);';

async function mutateLedger(pool, operation, prepare, clock) {
 return serialize(pool, async client => {
  const interlock = await readInterlock(client);
  if (interlock.pending !== null) throw Error('Unresolved budget operation');
  // Leave room for the final version advance.
  if (interlock.version >= Number.MAX_SAFE_INTEGER - 1) throw Error('Interlock version exhausted');
  const ledgers = await readLedgers(client);
  const {updates, evidenceDigest, expiresAt, overrun = false} = await prepare(ledgers, interlock.version);
  const before = ledgerDigest(ledgers);
  const pending = JSON.stringify({
   ...operation,
   operationId: randomUUID(),
   preparedAt: clock(),
   evidenceDigest,
   before,
   after: ledgerDigest({...ledgers, ...updates}),
   overrun
  });
  const marked = await transaction(client, () => changeInterlock(client, interlock, pending));
  await transaction(client, async () => {
   if (clock() >= expiresAt || ledgerDigest(await readLedgers(client)) !== before) {
    throw Error('Evidence expired or ledger changed');
   }
   for (const [month, state] of Object.entries(updates)) {
    const result = await client.query('UPDATE da_monthly_budget_disabled SET state=$2::jsonb WHERE month=$1', [month, JSON.stringify(state)]);
    if (result.rowCount !== 1) throw Error('Ledger update denied');
   }
  });
  if (!overrun) await transaction(client, () => changeInterlock(client, marked, null));
 });
}

function createPersistentBudget({pool, verifyEvidence, clock = Date.now} = {}) {
 if (typeof pool?.connect !== 'function' || typeof verifyEvidence !== 'function' || typeof clock !== 'function') {
  throw Error('Missing trusted dependencies');
 }
 return Object.freeze({async reserve(input) {
  const request = structuredClone(input);
  await mutateLedger(pool, {kind: 'reservation', id: request.id}, async (ledgers, version) => {
   const now = clock();
   const evidence = await verifyEvidence({request: structuredClone(request), ledgers: structuredClone(ledgers), version, now});
   if (!Number.isSafeInteger(evidence?.expiresAt) || evidence.expiresAt < request.expiresAt ||
       evidence.version !== version || evidence.digest !== request.evidenceSha256 || evidence.ledgerDigest !== ledgerDigest(ledgers)) {
    throw Error('Evidence denied');
   }
   const updates = reserveLiabilities({ledgers, request, evidence, now});
   return {updates, evidenceDigest: evidence.digest, expiresAt: request.expiresAt};
  }, clock);
  return Object.freeze({reserved: true, id: request.id, executionAuthorized: false});
 }});
}

module.exports = {createPersistentBudget, mutateLedger, schemaSQL};
