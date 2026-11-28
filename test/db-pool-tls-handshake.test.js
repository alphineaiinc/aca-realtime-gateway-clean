'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const tls = require('node:tls');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { Client } = require('pg');

// Disposable, protocol-level PostgreSQL SSL negotiation with an untrusted
// self-signed certificate. No actual PostgreSQL server or database is used.
test('pg rejects an untrusted TLS certificate during PostgreSQL SSL negotiation', { timeout: 15000 }, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aca-pg-tls-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const key = path.join(dir, 'key.pem');
  const cert = path.join(dir, 'cert.pem');
  const generated = spawnSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256',
    '-keyout', key, '-out', cert, '-days', '1',
    '-subj', '/CN=localhost'
  ], { encoding: 'utf8', timeout: 10000 });
  assert.equal(generated.status, 0, generated.stderr || generated.error?.message);

  const secureContext = tls.createSecureContext({
    key: fs.readFileSync(key),
    cert: fs.readFileSync(cert),
  });
  const server = net.createServer(socket => {
    socket.once('data', request => {
      // PostgreSQL SSLRequest is exactly 8 bytes, with magic 80877103.
      if (request.length !== 8 || request.readUInt32BE(4) !== 80877103) {
        socket.destroy();
        return;
      }
      socket.write('S', () => {
        const wrapped = new tls.TLSSocket(socket, { isServer: true, secureContext });
        wrapped.on('error', () => {});
        wrapped.on('secure', () => wrapped.end());
      });
    });
  });
  server.on('error', () => {});
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => server.close());
  const client = new Client({
    host: '127.0.0.1',
    port: server.address().port,
    user: 'test',
    database: 'test',
    connectionTimeoutMillis: 3000,
    ssl: { rejectUnauthorized: true },
  });
  t.after(() => client.end().catch(() => {}));
  await assert.rejects(client.connect(), error => {
    assert.match(String(error.message), /self.signed|certificate|unable to verify/i);
    return true;
  });
});
