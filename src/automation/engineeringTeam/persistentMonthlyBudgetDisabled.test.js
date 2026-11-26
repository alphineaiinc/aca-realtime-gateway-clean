'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const {generateKeyPairSync, sign, createHash} = require('node:crypto');
const {createAuthenticatedBudget} = require('./authenticatedBudgetDisabled');
const {ledgerDigest, recordSettlement} = require('./budgetEvidenceDisabled');

const nov = '2026-11', dec = '2026-12';
const boundary = Date.parse('2026-12-01T05:00:00Z');
const signer = () => {
 const {publicKey, privateKey} = generateKeyPairSync('ed25519');
 return {keys: {test: publicKey.export({type: 'spki', format: 'pem'})}, envelope(data) {
  const payload = JSON.stringify(data);
  return {keyId: 'test', payload, signature: sign(null, Buffer.from(payload), privateKey).toString('base64')};
 }};
};

// Models connection-scoped locks, transactional writes, JSONB key reordering and lost acknowledgements.
function fixture() {
 let now = boundary - 1000;
 let durable = {version: 0, pending: null, ledgers: Object.fromEntries([nov, dec].map(month =>
  [month, {month, entries: [], fixedAndAccruedCents: 0, reconciled: true}]))};
 let tail = Promise.resolve();
 let commits = 0;
 let fault;
 const pool = {async connect() {
  let unlock, staged;
  return {async query(sql, args) {
   if (sql.includes('pg_advisory_lock(')) {
    const previous = tail;
    tail = new Promise(resolve => { unlock = resolve; });
    await previous;
    return {};
   }
   if (sql.includes('pg_advisory_unlock(')) {
    unlock();
    unlock = undefined;
    return {rows: [{unlocked: true}]};
   }
   if (sql === 'BEGIN') { staged = structuredClone(durable); return {}; }
   if (sql.startsWith('SET LOCAL')) return {};
   if (sql === 'ROLLBACK') { staged = undefined; return {}; }
   if (sql === 'COMMIT') {
    commits++;
    if (fault?.commit === commits && !fault.persist) throw Error('commit lost before persistence');
    durable = staged;
    staged = undefined;
    if (fault?.commit === commits) throw Error('commit acknowledgement lost');
    return {};
   }
   const state = staged || durable;
   if (sql.startsWith('SELECT version')) return {rowCount: 1, rows: [{version: String(state.version), pending: state.pending}]};
   if (sql.startsWith('SELECT month,state')) return {rows: Object.entries(state.ledgers).map(([month, value]) =>
    ({month, state: structuredClone(value)}))};
   assert.ok(staged, 'writes require a transaction');
   if (sql.startsWith('UPDATE da_budget_interlock')) {
    if (state.version !== args[2] || state.pending !== args[3]) return {rowCount: 0};
    [state.version, state.pending] = args;
    return {rowCount: 1};
   }
   if (sql.startsWith('UPDATE da_monthly_budget')) {
    assert.ok(durable.pending, 'pending evidence must be durable before ledger writes');
    const ordered = JSON.parse(args[1], (_, value) => value && typeof value === 'object' && !Array.isArray(value)
     ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => b.localeCompare(a))) : value);
    state.ledgers[args[0]] = ordered;
    return {rowCount: 1};
   }
   throw Error('Unexpected SQL: ' + sql);
  }, release() { unlock?.(); }};
 }};
 const admission = signer(), reconciler = signer();
 const clock = () => now;
 const budget = () => createAuthenticatedBudget({pool, keys: admission.keys, reconciliationKeys: reconciler.keys, clock});
 const bounds = (workCents = 8000) => ({fixedCents: 1000, accruedCents: 500, taxCents: 500, feeCents: 200, fxCents: 100,
  workCents, cleanupCents: 1000});
 function reservation(id, patch = {}) {
  const input = {id, expiresAt: now + 500};
  const envelope = admission.envelope({kind: 'reservation', id, version: durable.version, currency: 'CAD', requestExpiresAt: input.expiresAt,
   issuedAt: now - 1, expiresAt: now + 900, liabilityThrough: input.expiresAt,
   months: {[now < boundary ? nov : dec]: bounds()}, ledgerDigest: ledgerDigest(durable.ledgers),
   allPriorLiabilitiesReconciled: true, providerHardLimitVerified: true, ...patch});
  input.evidenceSha256 = createHash('sha256').update(envelope.payload).digest('hex');
  return [input, envelope];
 }
 function proof(outcome, patch = {}, authority = reconciler) {
  const pending = JSON.parse(durable.pending);
  return authority.envelope({kind: 'transaction-reconciliation', operationId: pending.operationId, id: pending.id,
   version: durable.version, pendingDigest: ledgerDigest(pending), ledgerDigest: ledgerDigest(durable.ledgers),
   reservationsRetained: true, ledgerReconciled: true, outcome, issuedAt: now, expiresAt: now + 1000, ...patch});
 }
 function settle(actualCents) {
  const entry = durable.ledgers[nov].entries[0];
  const envelope = admission.envelope({kind: 'settlement', month: nov, currency: 'CAD', id: entry.id,
   reservationDigest: entry.evidenceSha256, ledgerDigest: ledgerDigest(durable.ledgers),
   issuedAt: now - 1, expiresAt: now + 1000, actualCents});
  return recordSettlement({pool, keys: admission.keys, envelope, month: nov, id: entry.id, clock});
 }
 return {budget, bounds, reservation, proof, admission, settle, clock, state: () => durable,
  time: value => { now = value; }, fault: (commit, persist) => { fault = {commit: commits + commit, persist}; }};
}

test('concurrent reservations serialize and a freshly authenticated request still cannot exceed the cap', async () => {
 const f = fixture();
 const results = await Promise.allSettled([f.budget().reserve(...f.reservation('a')), f.budget().reserve(...f.reservation('b'))]);
 assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
 assert.equal(results.find(result => result.status === 'fulfilled').value.executionAuthorized, false);
 await assert.rejects(f.budget().reserve(...f.reservation('c')), /Budget denied/);
 assert.equal(f.state().ledgers[nov].entries.length, 1);
});

test('Toronto boundary reserves both months atomically and denies another month with insufficient headroom', async () => {
 const f = fixture();
 const liabilityThrough = boundary + 1;
 await assert.rejects(f.budget().reserve(...f.reservation('a', {liabilityThrough, months: {
  [nov]: f.bounds(), [dec]: f.bounds(14000)
 }})), /Budget denied/);
 assert.equal(f.state().ledgers[nov].entries.length, 0);
 await f.budget().reserve(...f.reservation('a', {liabilityThrough, months: {[nov]: f.bounds(), [dec]: f.bounds()}}));
 assert.equal(f.state().ledgers[nov].entries[0].id, 'a');
 assert.equal(f.state().ledgers[dec].entries[0].id, 'a');
 assert.equal(f.state().ledgers[dec].fixedAndAccruedCents, 1500);
});

test('missing months, unknown FX, absent cleanup and tampered evidence fail closed', async () => {
 const f = fixture();
 for (const patch of [{liabilityThrough: boundary}, {months: {[nov]: {...f.bounds(), fxCents: undefined}}},
  {months: {[nov]: {...f.bounds(), cleanupCents: 0}}}, {providerHardLimitVerified: false}]) {
  await assert.rejects(f.budget().reserve(...f.reservation('a', patch)));
 }
 const [input, envelope] = f.reservation('a');
 await assert.rejects(f.budget().reserve(input, {...envelope, payload: envelope.payload + ' '}), /Invalid signature/);
 assert.equal(f.state().version, 0);
});

for (const persist of [false, true]) {
 test('ambiguous ledger commit with persist=' + persist + ' stays blocked after restart', async () => {
  const f = fixture();
  f.fault(2, persist);
  const original = f.reservation('a');
  await assert.rejects(f.budget().reserve(...original), /commit/);
  assert.equal(f.state().ledgers[nov].entries.length, Number(persist));
  f.time(boundary);
  await assert.rejects(f.budget().reserve(...f.reservation('different-provider')), /Unresolved/);
  const outcome = persist ? 'committed' : 'not-committed';
  await assert.rejects(f.budget().reconcile(f.proof(outcome, {}, f.admission)));
  await assert.rejects(f.budget().reconcile(f.proof(outcome, {version: 0})), /scope/);
  await assert.rejects(f.budget().reconcile(f.proof(outcome, {operationId: 'different'})), /scope/);
  await assert.rejects(f.budget().reconcile(f.proof(outcome, {issuedAt: f.clock() - 600000})), /uncertainty/);
  await assert.rejects(f.budget().reconcile(f.proof(persist ? 'not-committed' : 'committed')), /uncertainty/);
  const evidence = f.proof(outcome);
  const results = await Promise.allSettled([f.budget().reconcile(evidence), f.budget().reconcile(evidence)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'fulfilled').value.executionAuthorized, false);
  assert.equal(f.state().ledgers[nov].entries.length, Number(persist));
  if (persist) await assert.rejects(f.budget().reserve(...f.reservation('a')), /replay/);
  else {
   f.time(boundary - 1000);
   await assert.rejects(f.budget().reserve(...original), /scope/);
  }
 });
}

for (const persist of [false, true]) {
 test('ambiguous pending commit with persist=' + persist + ' never writes ledger', async () => {
  const f = fixture();
  f.fault(1, persist);
  await assert.rejects(f.budget().reserve(...f.reservation('a')), /commit/);
  assert.equal(f.state().ledgers[nov].entries.length, 0);
  assert.equal(Boolean(f.state().pending), persist);
  if (persist) await assert.rejects(f.budget().reserve(...f.reservation('b')), /Unresolved/);
 });
}

test('settlement retains reservations and observations and denies replay', async () => {
 const f = fixture();
 await f.budget().reserve(...f.reservation('a'));
 assert.equal((await f.settle(500)).executionAuthorized, false);
 await assert.rejects(f.settle(500), /already recorded/);
 const state = f.state().ledgers[nov];
 assert.equal(state.entries[0].id, 'a');
 assert.equal(state.settlementObservations[0].actualCents, 500);
});

test('settlement overrun blocks admissions globally and cannot be cleared by outcome alone', async () => {
 const f = fixture();
 await f.budget().reserve(...f.reservation('a'));
 await f.settle(100000);
 await assert.rejects(f.budget().reconcile(f.proof('committed')), /uncertainty/);
 f.time(boundary);
 await assert.rejects(f.budget().reserve(...f.reservation('b')), /Unresolved/);
 assert.equal(f.state().ledgers[nov].settlementObservations[0].actualCents, 100000);
});

test('ambiguous settlement shares the reservation interlock and retains the original reservation', async () => {
 const f = fixture();
 await f.budget().reserve(...f.reservation('a'));
 f.fault(2, true);
 await assert.rejects(f.settle(500), /commit/);
 await assert.rejects(f.budget().reserve(...f.reservation('b')), /Unresolved/);
 await f.budget().reconcile(f.proof('committed'));
 assert.equal(f.state().ledgers[nov].entries[0].id, 'a');
 assert.equal(f.state().ledgers[nov].settlementObservations[0].actualCents, 500);
});

test('an observed overrun still blocks when the ledger transaction fails to persist', async () => {
 const f = fixture();
 await f.budget().reserve(...f.reservation('a'));
 f.fault(2, false);
 await assert.rejects(f.settle(100000), /commit/);
 await assert.rejects(f.budget().reconcile(f.proof('not-committed')), /uncertainty/);
 await assert.rejects(f.budget().reserve(...f.reservation('b')), /Unresolved/);
 assert.equal(f.state().ledgers[nov].entries[0].id, 'a');
});

test('the admission signing key cannot also be configured to reconcile', () => {
 const f = fixture();
 assert.throws(() => createAuthenticatedBudget({keys: f.admission.keys, reconciliationKeys: f.admission.keys}), /independent/);
});
