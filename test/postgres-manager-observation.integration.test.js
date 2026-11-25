'use strict';

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const { Pool } = require('pg');
const { createRestrictedManagerRuntime } = require('../src/automation/engineeringTeam/restrictedManagerRuntime');
const { createPostgresObservationStore } = require('../src/automation/engineeringTeam/postgresObservationStore');

const scope = { product: 'aca', repository: 'example/aca', sha: 'a'.repeat(40) };
const issue = 42;
const observation = {
  status: 'observed', scope, issue, executionAuthorized: false,
  writeAuthorized: false, deployAuthorized: false, paidProviderAuthorized: false,
};

test('isolated PostgreSQL manager observation acceptance', {
  skip: process.env.RUN_MANAGER_OBSERVATION_CI !== '1',
  timeout: 30000,
}, async t => {
  const url = new URL(process.env.MANAGER_OBSERVATION_CI_DATABASE_URL);
  assert.equal(url.protocol, 'postgresql:');
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.pathname, '/aca_manager_observation_ci');
  assert.equal(url.search, '');
  const pools = Array.from({ length: 2 }, () => new Pool({
    connectionString: url.toString(), max: 4, connectionTimeoutMillis: 5000,
  }));
  t.after(() => Promise.all(pools.map(pool => pool.end())));
  await pools[0].query(readFileSync('migrations/draft_manager_observations.sql', 'utf8'));
  const stores = pools.map(pool => createPostgresObservationStore({ pool, scope, issue }));

  await t.test('serializes independent pools and replays the committed observation', async () => {
    const event = randomUUID();
    let observed = 0;
    const results = await Promise.all(Array.from({ length: 16 }, (_, index) =>
      stores[index % 2].observeEvent(event, async () => {
        observed++;
        return observation;
      })));
    assert.equal(observed, 1);
    assert.equal(results.filter(result => !result.replayed).length, 1);
    for (const result of results) {
      assert.equal(result.attempts, 1);
      assert.deepEqual(result.observation, observation);
    }

    const otherIssue = createPostgresObservationStore({ pool: pools[1], scope, issue: issue + 1 });
    assert.equal((await otherIssue.observeEvent(event, async () => ({
      ...observation, issue: issue + 1,
    }))).replayed, false);
  });

  await t.test('persists the retry budget across interleaved events and recreated stores', async () => {
    const event = randomUUID();
    let calls = 0;
    const unavailable = async () => { calls++; return { status: 'unavailable' }; };
    assert.equal((await stores[0].observeEvent(event, unavailable)).attempts, 1);
    assert.equal((await stores[0].observeEvent(randomUUID(), async () => observation)).status, 'observed');
    const recreated = createPostgresObservationStore({ pool: pools[1], scope, issue });
    const advance = async minutes => {
      const {rows:[row]}=await pools[0].query('SELECT extract(epoch FROM (next_attempt_at-clock_timestamp())) AS remaining FROM engineering_team_manager_observations WHERE event_key=$1',[event]);
      assert.ok(Number(row.remaining)>minutes*60-10 && Number(row.remaining)<=minutes*60);
      await pools[0].query("UPDATE engineering_team_manager_observations SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE event_key=$1",[event]);
    };
    const burst = () => Promise.all(Array.from({length:12},(_,i)=>(i%2?recreated:stores[0]).observeEvent(event,unavailable)));
    assert.ok((await burst()).every(r=>r.status==='deferred'&&r.attempts===1));
    assert.equal(calls,1);
    assert.ok(!(await recreated.dueEvents()).includes(event));
    await advance(5);
    assert.ok((await recreated.dueEvents()).includes(event));
    assert.equal((await burst()).filter(r=>!r.replayed).length,1);
    assert.equal(calls,2);
    assert.ok((await burst()).every(r=>r.status==='deferred'&&r.attempts===2));
    await advance(10);
    assert.equal((await burst()).filter(r=>!r.replayed).length,1);
    assert.equal(calls,3);
    assert.ok(!(await recreated.dueEvents()).includes(event));
    assert.deepEqual(await recreated.observeEvent(event, () => assert.fail('exhausted event executed')), {
      status: 'exhausted', replayed: true, attempts: 3,
    });
  });

  await t.test('restricted runtime replays without repeating metadata reads', async () => {
    const event = randomUUID();
    let requests = 0;
    const fetchImpl = async (url, options) => {
      requests++;
      assert.equal(options.method, 'GET');
      const payload = url.includes('/issues/')
        ? { number: issue, state: 'open', labels: [] }
        : { total_count: 0, workflow_runs: [] };
      return new Response(JSON.stringify(payload));
    };
    const runtimes = pools.map(observationPool => createRestrictedManagerRuntime({
      scope, issue, observationPool, readStopState:async()=>false, githubToken: 'fixture-token', fetchImpl,
    }));
    assert.equal(requests, 0);
    const first = await runtimes[0].observeEvent(event);
    const replay = await runtimes[1].observeEvent(event);
    assert.equal(first.status, 'observed');
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.observation, first.observation);
    assert.equal(requests, 2);
  });

  await t.test('stop denies cached replay without network access', async () => {
    const event = randomUUID();
    let stopped = false, requests = 0;
    const runtime = createRestrictedManagerRuntime({
      scope, issue, observationPool: pools[0], githubToken: 'fixture-token',
      readStopState: async () => stopped,
      fetchImpl: async url => {
        requests++;
        return new Response(JSON.stringify(url.includes('/issues/')
          ? { number: issue, state: 'open', labels: [] }
          : { total_count: 0, workflow_runs: [] }));
      },
    });
    assert.equal((await runtime.observeEvent(event)).status, 'observed');
    stopped = true;
    assert.equal((await runtime.observeEvent(event)).status, 'unavailable');
    assert.equal(requests, 2);
    stopped = false;
    assert.equal((await runtime.observeEvent(event)).replayed, true);
    assert.equal(requests, 2);
  });

  await t.test('rolls back invalid, oversized, and failed observations', async () => {
    const event = randomUUID();
    await assert.rejects(stores[0].observeEvent(event, async () => ({ ...observation, writeAuthorized: true })),
      /scope or authority denied/);
    await assert.rejects(stores[0].observeEvent(event, async () => ({ ...observation, extra: 'x'.repeat(32768) })),
      /size exceeded/);
    await assert.rejects(stores[0].observeEvent(event, async () => { throw new Error('fixture failure'); }),
      /fixture failure/);
    assert.equal((await stores[1].observeEvent(event, async () => observation)).attempts, 1);
  });
});
