'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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
  assert.match(config.connectionString, /sslmode=require/);
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
