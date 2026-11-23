'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');

// Opt-in only. Never runs against a production URL by default.
// The caller must supply a dedicated, read-only staging credential.
test('isolated staging Neon verifies TLS and permits a read-only query', {
  skip: process.env.RUN_ACA_STAGING_TLS_CHECK !== '1'
    ? 'Explicit staging TLS gate not enabled'
    : false,
  timeout: 15000,
}, async () => {
  const url = process.env.ACA_STAGING_TLS_DATABASE_URL;
  assert.ok(url, 'ACA_STAGING_TLS_DATABASE_URL is required');
  const parsed = new URL(url);
  assert.ok(parsed.hostname.toLowerCase().endsWith('.neon.tech'), 'Only Neon staging endpoints are allowed');
  assert.equal(decodeURIComponent(parsed.username), 'aca_tls_probe_readonly', 'Dedicated read-only role required');
  assert.equal(decodeURIComponent(parsed.pathname.slice(1)), 'aca_phase2_staging', 'Staging database required');
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) {
    parsed.searchParams.delete(key);
  }
  const client = new Client({
    connectionString: parsed.toString(),
    ssl: { rejectUnauthorized: true },
    connectionTimeoutMillis: 5000,
    application_name: 'aca-staging-tls-readonly-check',
  });
  try {
    await client.connect();
    const socket = client.connection.stream;
    assert.equal(socket.encrypted, true, 'Client transport must be encrypted');
    assert.equal(socket.authorized, true, 'Client must verify the server certificate');
    assert.ok(socket.getProtocol(), 'Client TLS protocol must be negotiated');
    await client.query('BEGIN READ ONLY');
    const identity = await client.query('SELECT current_user, current_database()');
    assert.equal(identity.rows[0].current_user, 'aca_tls_probe_readonly');
    assert.equal(identity.rows[0].current_database, 'aca_phase2_staging');
    const result = await client.query(
      'SELECT ssl, version FROM pg_stat_ssl WHERE pid = pg_backend_pid()'
    );
    assert.equal(result.rows.length, 1);
    // Backend TLS metadata can describe the proxy-to-compute hop.
    // The authenticated client socket above is the mandatory security gate.
    console.log('Client TLS:', socket.getProtocol(), 'certificate authorized:', socket.authorized);
    console.log('Backend TLS reported:', result.rows[0].ssl);
    await client.query('ROLLBACK');
  } finally {
    await client.end().catch(() => {});
  }
});
