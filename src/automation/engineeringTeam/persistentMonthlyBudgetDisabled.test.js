'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const {generateKeyPairSync, sign, createHash} = require('node:crypto');
const {createAuthenticatedBudget} = require('./authenticatedBudgetDisabled');
const {ledgerDigest} = require('./budgetEvidenceDisabled');
const {monthAt} = require('./aggregateMonthlyBudgetDisabled');

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
 let dbNow;
 let beforeStatement = () => {};
 const writtenMonths = [];
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
   await beforeStatement(sql, args);
   const state = staged || durable;
   if (sql.startsWith('SELECT version')) return {rowCount: 1, rows: [{version: String(state.version), pending: state.pending}]};
   if (sql.startsWith('SELECT month,state')) return {rows: Object.entries(state.ledgers).map(([month, value]) =>
    ({month, state: structuredClone(value)}))};
   assert.ok(staged, 'writes require a transaction');
   if (sql.startsWith('UPDATE da_budget_interlock')) {
    if (state.version !== args[2] || state.pending !== args[3]) return {rowCount: 0};
    if (sql.includes('clock_timestamp()') && (dbNow ?? now) >= args[4]) return {rowCount: 0};
    [state.version, state.pending] = args;
    return {rowCount: 1};
   }
   if (sql.startsWith('UPDATE da_monthly_budget')) {
    assert.ok(durable.pending, 'pending evidence must be durable before ledger writes');
    const instant = dbNow ?? now;
    if (sql.includes('clock_timestamp()') &&
        (instant >= args[2] || monthAt(instant) !== args[3])) return {rowCount: 0};
    writtenMonths.push(args[0]);
    const ordered = JSON.parse(args[1], (_, value) => value && typeof value === 'object' && !Array.isArray(value)
     ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => b.localeCompare(a))) : value);
    state.ledgers[args[0]] = ordered;
    return {rowCount: 1};
   }
   throw Error('Unexpected SQL: ' + sql);
  }, release() { unlock?.(); }};
 }};
 const admission = signer(), reconciler = signer(), settlement = signer();
 const clock = () => now;
 const budget = (options = {}) => createAuthenticatedBudget({
  pool, keys: admission.keys, reconciliationKeys: reconciler.keys, settlementKeys: settlement.keys, clock, ...options
 });
 const bounds = (workCents = 8000) => ({fixedCents: 1000, accruedCents: 500, taxCents: 500, feeCents: 200, fxCents: 100,
  workCents, cleanupCents: 1000});
 function reservation(id, patch = {}, requestExpiresAt = now + 500) {
  const input = {id, expiresAt: requestExpiresAt};
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
 function settlementProof(actualCents, authority = settlement) {
  const entry = durable.ledgers[nov].entries[0];
  const envelope = authority.envelope({kind: 'settlement', month: nov, currency: 'CAD', id: entry.id, version: durable.version,
   reservationDigest: entry.evidenceSha256, ledgerDigest: ledgerDigest(durable.ledgers),
   issuedAt: now - 1, expiresAt: now + 1000, actualCents});
  return [{month: nov, id: entry.id}, envelope];
 }
 const settle = actualCents => budget().settle(...settlementProof(actualCents));
 return {budget, bounds, reservation, proof, admission, settlement, reconciler, settlementProof, settle, clock, writtenMonths,
  delay: hook => { beforeStatement = hook; }, dbTime: value => { dbNow = value; }, state: () => durable,
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

test('settlement rejects substituted keys before durable writes and captures trust pins at construction', async () => {
 const f = fixture();
 await f.budget().reserve(...f.reservation('a'));
 const substitute = signer();
 const key = Buffer.from(f.settlement.keys.test);
 const source = {test: key};
 const budget = f.budget({settlementKeys: source});
 key.fill(0);
 source.test = substitute.keys.test;
 const before = structuredClone(f.state());
 await assert.rejects(budget.settle(...f.settlementProof(500, substitute)), /Invalid signature/);
 await assert.rejects(budget.settle(...f.settlementProof(500, f.admission)), /Invalid signature/);
 await assert.rejects(f.budget({settlementKeys: undefined}).settle(...f.settlementProof(500)), /Missing settlement/);
 assert.deepEqual(f.state(), before);
 assert.throws(() => f.budget({settlementKeys: {alias: f.admission.keys.test}}), /independent/);
 assert.throws(() => f.budget({settlementKeys: {alias: f.reconciler.keys.test}}), /independent/);
 assert.equal((await budget.settle(...f.settlementProof(500))).recorded, true);
});

for (const deadline of ['signed expiry', 'maximum age']) {
 test('reconciliation delayed in SQL past ' + deadline + ' preserves pending evidence', async () => {
  const f = fixture();
  f.fault(2, false);
  await assert.rejects(f.budget().reserve(...f.reservation('a')), /commit/);
  const before = structuredClone(f.state());
  const expiresAt = f.clock() + (deadline === 'signed expiry' ? 50 : 600000);
  const cutoff = Math.min(expiresAt, f.clock() + 300000);
  f.delay(async (sql, args) => {
   if (!sql.startsWith('UPDATE da_budget_interlock') || args[1] !== null) return;
   assert.match(sql, /clock_timestamp\(\)/);
   assert.equal(args[4], cutoff);
   await new Promise(resolve => setImmediate(resolve));
   f.dbTime(cutoff);
  });
  await assert.rejects(f.budget().reconcile(f.proof('not-committed', {expiresAt})), /Interlock conflict/);
  assert.deepEqual(f.state(), before);
 });
}

for (const delay of ['expiry', 'Toronto rollover']) {
 test('multi-month reservation rolls back the first write on delayed ' + delay, async () => {
  const f = fixture();
  const before = structuredClone(f.state().ledgers);
  const expiresAt = delay === 'expiry' ? boundary - 500 : boundary + 500;
  const request = f.reservation('a', {
   expiresAt: boundary + 900, liabilityThrough: boundary + 800, months: {[nov]: f.bounds(), [dec]: f.bounds()}
  }, expiresAt);
  f.delay(async (sql, args) => {
   if (!sql.startsWith('UPDATE da_monthly_budget')) return;
   assert.match(sql, /clock_timestamp\(\)/);
   assert.match(sql, /America\/Toronto/);
   assert.equal(args[3], nov);
   if (args[0] === dec) {
    await new Promise(resolve => setImmediate(resolve));
    f.dbTime(delay === 'expiry' ? request[0].expiresAt : boundary);
   }
  });
  await assert.rejects(f.budget().reserve(...request), /Ledger update denied/);
  assert.deepEqual(f.writtenMonths, [nov]);
  assert.deepEqual(f.state().ledgers, before);
  assert.ok(f.state().pending);
 });
}

test('settlement crossing the Toronto boundary during preparation retains the reservation and pending evidence', async () => {
 const f = fixture();
 await f.budget().reserve(...f.reservation('a'));
 const before = structuredClone(f.state().ledgers);
 f.time(boundary - 1);
 const proof = f.settlementProof(500);
 f.delay(async sql => {
  if (sql === 'SELECT month,state FROM da_monthly_budget_disabled ORDER BY month') {
   await new Promise(resolve => setImmediate(resolve));
   f.time(boundary);
  }
 });
 await assert.rejects(f.budget().settle(...proof), /Ledger update denied/);
 assert.deepEqual(f.state().ledgers, before);
 assert.ok(f.state().pending);
});

test('original settlement proof cannot be replayed after rollback and authenticated not-committed reconciliation', async () => {
 const f = fixture();
 await f.budget().reserve(...f.reservation('a'));
 const original = f.settlementProof(500);
 const ledgers = structuredClone(f.state().ledgers);
 f.fault(2, false);
 await assert.rejects(f.budget().settle(...original), /commit/);
 await f.budget().reconcile(f.proof('not-committed'));
 assert.deepEqual(f.state().ledgers, ledgers);
 const reconciled = structuredClone(f.state());
 await assert.rejects(f.budget().settle(...original), /Evidence scope mismatch/);
 assert.deepEqual(f.state(), reconciled);
 assert.equal((await f.settle(500)).recorded, true);
 assert.equal(f.state().ledgers[nov].settlementObservations.length, 1);
});
