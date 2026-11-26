'use strict';

const {createPublicKey, KeyObject, randomUUID} = require('node:crypto');
const {authenticate, ledgerDigest} = require('./budgetEvidenceDisabled');
const {entryTotal, monthAt, reserveLiabilities} = require('./aggregateMonthlyBudgetDisabled');
const {writeLedger} = require('./persistentMonthlyBudgetDisabled');
const {createInterlock} = require('./budgetInterlockDisabled');
const {serialize, transaction, readInterlock, changeInterlock, readLedgers} = require('./pgBudgetInterlockDisabled');

function pinKeys(keys) {
 return Object.freeze(Object.fromEntries(Object.entries(keys || {}).map(([id, input]) => {
  const key = input instanceof KeyObject && input.type === 'public' ? input : createPublicKey(input);
  if (key.asymmetricKeyType !== 'ed25519') throw Error('Invalid trust root');
  return [id, key.export({type: 'spki', format: 'pem'})];
 })));
}

// Disabled facade. Trust pins must come from independent custody.
function createAuthenticatedBudget({pool, keys, reconciliationKeys, settlementKeys, clock = Date.now}) {
 const pins = pinKeys(keys);
 const reconciliationPins = pinKeys(reconciliationKeys);
 const settlementPins = pinKeys(settlementKeys);
 if (!Object.keys(pins).length) throw Error('Missing trust roots');
 const admission = new Set(Object.values(pins));
 const reconciliation = Object.values(reconciliationPins);
 if (reconciliation.some(pin => admission.has(pin))) throw Error('Reconciliation requires independent signing keys');
 const otherAuthorities = new Set([...admission, ...reconciliation]);
 if (Object.values(settlementPins).some(pin => otherAuthorities.has(pin))) {
  throw Error('Settlement requires independent signing keys');
 }
 const interlock = reconciliationKeys && createInterlock({pool, keys: reconciliationPins, clock});

 async function mutateLedger(operation, prepare) {
  return serialize(pool, async client => {
   const interlock = await readInterlock(client);
   if (interlock.pending !== null) throw Error('Unresolved budget operation');
   // Leave room for the final version advance.
   if (interlock.version >= Number.MAX_SAFE_INTEGER - 1) throw Error('Interlock version exhausted');
   const now = clock();
   const preparedMonth = monthAt(now);
   const ledgers = await readLedgers(client);
   const {updates, evidenceDigest, expiresAt, overrun = false} = prepare(ledgers, interlock.version, now);
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
    const lockedLedgers = await readLedgers(client, {lock: true});
    if (clock() >= expiresAt || ledgerDigest(lockedLedgers) !== before) {
     throw Error('Evidence expired or ledger changed');
    }
    for (const [month, state] of Object.entries(updates)) {
     await writeLedger(client, month, state, {expiresAt, preparedMonth});
    }
   });
   if (!overrun) await transaction(client, () => changeInterlock(client, marked, null));
  });
 }

 return Object.freeze({
  async reserve(input, envelope) {
   if (typeof pool?.connect !== 'function' || typeof clock !== 'function') throw Error('Missing trusted dependencies');
   const request = structuredClone(input);
   const proof = structuredClone(envelope);
   await mutateLedger({kind: 'reservation', id: request.id}, (ledgers, version, now) => {
    const {payload, digest} = authenticate(proof, pins, {
     kind: 'reservation', currency: 'CAD', version, id: request.id, requestExpiresAt: request.expiresAt
    }, now);
    if (payload.expiresAt < request.expiresAt || digest !== request.evidenceSha256 ||
        payload.ledgerDigest !== ledgerDigest(ledgers)) throw Error('Evidence denied');
    const updates = reserveLiabilities({ledgers, request, evidence: payload, now});
    return {updates, evidenceDigest: digest, expiresAt: request.expiresAt};
   });
   return Object.freeze({reserved: true, id: request.id, executionAuthorized: false});
  },
  async settle({month, id}, envelope) {
   if (!Object.keys(settlementPins).length) throw Error('Missing settlement trust roots');
   const proof = structuredClone(envelope);
   await mutateLedger({kind: 'settlement', id, month}, (ledgers, version, now) => {
    const state = Object.hasOwn(ledgers, month) && ledgers[month];
    const entry = state && state.entries.find(candidate => candidate.id === id);
    if (!entry || state.reconciled !== true) throw Error('Missing reservation');
    const {payload, digest} = authenticate(proof, settlementPins, {
     kind: 'settlement', month, id, currency: 'CAD', version, reservationDigest: entry.evidenceSha256,
     ledgerDigest: ledgerDigest(ledgers)
    }, now);
    if (!Number.isSafeInteger(payload.actualCents) || payload.actualCents < 0) throw Error('Invalid settlement');
    const records = state.settlementObservations || [];
    if (records.some(record => record.id === id)) throw Error('Settlement already recorded');
    // Observations are append-only. An overrun leaves the interlock pending.
    const overrun = payload.actualCents > entryTotal(entry);
    const next = {...state, reconciled: !overrun, executionAuthorized: false,
     settlementObservations: [...records, {id, digest, actualCents: payload.actualCents}]};
    return {updates: {[month]: next}, evidenceDigest: digest, expiresAt: payload.expiresAt, overrun};
   });
   return {recorded: true, executionAuthorized: false};
  },
  async reconcile(envelope) {
   if (!interlock) throw Error('Missing reconciliation trust roots');
   return interlock.reconcile(envelope);
  }
 });
}

module.exports = {createAuthenticatedBudget};
