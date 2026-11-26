'use strict';

const {authenticate, ledgerDigest} = require('./budgetEvidenceDisabled');
const {serialize, transaction, readInterlock, changeInterlock, readLedgers} = require('./pgBudgetInterlockDisabled');

const MAX_PROOF_AGE_MS = 5 * 60 * 1000;

function createInterlock({pool, keys, clock = Date.now}) {
 const pins = Object.freeze({...keys});
 if (!Object.keys(pins).length || typeof pool?.connect !== 'function') throw Error('Missing reconciliation dependencies');
 return Object.freeze({async reconcile(envelope) {
  const proof = structuredClone(envelope);
  return serialize(pool, client => transaction(client, async () => {
   const current = await readInterlock(client);
   if (current.pending === null) throw Error('No reconcilable operation');
   const pending = JSON.parse(current.pending);
   if (!pending?.operationId || !Number.isSafeInteger(pending.preparedAt)) throw Error('Invalid pending evidence');
   const ledgers = await readLedgers(client);
   const digest = ledgerDigest(ledgers);
   const now = clock();
   const {payload} = authenticate(proof, pins, {
    kind: 'transaction-reconciliation', operationId: pending.operationId, id: pending.id,
    version: current.version, pendingDigest: ledgerDigest(pending), ledgerDigest: digest,
    reservationsRetained: true, ledgerReconciled: true
   }, now);
   if (payload.issuedAt < pending.preparedAt || now - payload.issuedAt > MAX_PROOF_AGE_MS || pending.overrun !== false ||
       !Object.values(ledgers).every(state => state.reconciled === true) ||
       !((payload.outcome === 'committed' && digest === pending.after) ||
         (payload.outcome === 'not-committed' && digest === pending.before))) {
    throw Error('Reconciliation uncertainty');
   }
   await changeInterlock(client, current, null);
   return {reconciled: true, executionAuthorized: false};
  }));
 }});
}

module.exports = {createInterlock};
