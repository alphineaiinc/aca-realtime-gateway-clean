'use strict';
// Phase 2 GitHub CI only: one disposable database per integration test.
const { Client } = require('pg');
const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const path = require('node:path');

const tests = [
  'postgres-correction-ledger',
  'postgres-role-isolation',
  'postgres-repository-rls',
  'postgres-owner-decision',
  'postgres-owner-oauth',
  'postgres-owner-edge-nonce',
  'postgres-owner-private-chain',
  'postgres-owner-mtls-chain',
];

async function main() {
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.CI !== 'true') {
    throw new Error('This runner is restricted to GitHub Actions CI.');
  }
  const raw = process.env.ACA_TEST_DATABASE_URL;
  if (!raw) throw new Error('ACA_TEST_DATABASE_URL is required.');
  const url = new URL(raw);
  if (url.protocol !== 'postgresql:' || !['localhost', '127.0.0.1'].includes(url.hostname)
      || url.port !== '5432' || url.pathname !== '/aca_automation_test'
      || url.username !== 'aca_test' || url.password !== 'aca_test_only'
      || url.search || url.hash) {
    throw new Error('Refusing to run against anything except the dedicated local CI PostgreSQL service.');
  }
  const adminUrl = new URL(raw);
  adminUrl.pathname = '/postgres';
  const admin = new Client({ connectionString: adminUrl.toString(), connectionTimeoutMillis: 5000 });
  await admin.connect();
  const failures = [];
  try {
    for (const name of tests) {
      const db = `phase2_ci_${randomBytes(10).toString('hex')}`;
      const quotedDb = `"${db}"`; // generated lowercase hex identifier only
      let created = false;
      try {
        await admin.query(`CREATE DATABASE ${quotedDb}`);
        created = true;
        const testUrl = new URL(raw);
        testUrl.pathname = `/${db}`;
        console.log(`\nRunning ${name} in fresh disposable database ${db}`);
        const result = spawnSync(process.execPath, ['--test', path.join('test', `${name}.integration.test.js`)], {
          stdio: 'inherit',
          env: { ...process.env, ACA_TEST_DATABASE_URL: testUrl.toString() },
          timeout: 120000,
        });
        if (result.error || result.status !== 0) {
          failures.push(name);
          console.error(`${name} failed: ${result.error?.message || `exit ${result.status}`}`);
        }
      } catch (error) {
        failures.push(name);
        console.error(`${name} setup failed: ${error.message}`);
      } finally {
        if (created) {
          try {
            // FORCE is supported by the GitHub Actions PostgreSQL 16 service.
            await admin.query(`DROP DATABASE ${quotedDb} WITH (FORCE)`);
          } catch (error) {
            failures.push(`cleanup:${name}`);
            console.error(`Cleanup failed for ${db}: ${error.message}`);
          }
        }
      }
    }
  } finally {
    await admin.end();
  }
  if (failures.length) throw new Error(`CI integration failures: ${failures.join(', ')}`);
  console.log('PASS: all 8 PostgreSQL integration files ran in isolated databases; cleanup succeeded.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
