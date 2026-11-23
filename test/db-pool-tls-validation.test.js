'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ConnectionParameters = require('pg/lib/connection-parameters');

const source = fs.readFileSync(path.join(__dirname, '../src/db/pool.js'), 'utf8');

function loadPool(databaseUrl) {
  let captured;
  const pool = {
    connect: async () => ({
      query: async () => ({ rows: [{ current_user: 'test' }] }),
      release() {},
    }),
    on() {},
  };
  const mocks = {
    path,
    pg: { Pool: class { constructor(config) { captured = config; return pool; } } },
    dotenv: { config() {} },
  };
  const context = {
    require: name => {
      if (!(name in mocks)) throw new Error('Unexpected import ' + name);
      return mocks[name];
    },
    __dirname: path.join(__dirname, '../src/db'),
    module: { exports: {} },
    process: { env: { DATABASE_URL: databaseUrl }, exit() {} },
    console: { log() {}, error() {} },
    URL,
  };
  vm.runInNewContext(source, context);
  return captured;
}

test('Neon URL enables certificate verification', () => {
  const config = loadPool('postgres://test:pass@db.example.neon.tech/db');
  assert.equal(config.ssl.rejectUnauthorized, true);
  assert.equal(config.connectionString.includes('sslmode='), false);
});

test('Render URL enables certificate verification', () => {
  const config = loadPool('postgres://test:pass@db.example.render.com/db');
  assert.equal(config.ssl.rejectUnauthorized, true);
});

test('local PostgreSQL keeps existing no-TLS behavior', () => {
  const config = loadPool('postgres://test:pass@localhost:5432/db');
  assert.equal(config.ssl, false);
});

test('shared pool must never disable certificate verification', () => {
  assert.equal(source.includes('rejectUnauthorized: false'), false);
});

test('cloud URL SSL query options cannot override certificate policy', () => {
  const config = loadPool(
    'postgres://test:pass@db.example.neon.tech/db?sslmode=require&sslrootcert=ignored&application_name=aca'
  );
  assert.equal(config.ssl.rejectUnauthorized, true);
  assert.equal(config.connectionString.includes('sslmode='), false);
  assert.equal(config.connectionString.includes('sslrootcert='), false);
  assert.equal(config.connectionString.includes('application_name=aca'), true);
});

test('node-postgres effective cloud TLS policy validates certificates', () => {
  for (const databaseUrl of [
    'postgres://test:pass@db.example.neon.tech/db',
    'postgres://test:pass@db.example.neon.tech/db?sslmode=require',
    'postgres://test:pass@db.example.render.com/db?sslmode=require&sslrootcert=ignored',
  ]) {
    const config = loadPool(databaseUrl);
    const effective = new ConnectionParameters(config);
    assert.equal(effective.ssl.rejectUnauthorized, true, databaseUrl);
  }
});
