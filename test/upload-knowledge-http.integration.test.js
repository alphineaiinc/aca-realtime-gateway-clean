'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const express = require('express');
const jwt = require('jsonwebtoken');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const source = fs.readFileSync(path.join(__dirname, '../src/routes/uploadKnowledge.js'), 'utf8');

test('real multipart and PDF parser enforce authentication and tenant-scoped ingestion', async t => {
  const secret = 'disposable-test-secret-not-for-production';
  const writes = [];
  const embeddings = [];
  const context = {
    require(name) {
      if (name === '../security/uploadAdmission') return { withUploadAdmission: async () => { throw Error('unexpected enabled admission'); } };
      if (name === '../db/pool') return { query: async (...args) => writes.push(args) };
      if (name === '../middleware/postgresRateLimit') return { createPostgresRateLimiter: () => (req, res, next) => next() };
      if (name === '../brain/utils/embeddingManager') return { embedText: async text => { embeddings.push(text); return [0.1, 0.2]; } };
      return require(name);
    },
    process: { env: { JWT_SECRET: secret } },
    Buffer, console, module: { exports: {} },
  };
  vm.runInNewContext(source, context);
  const app = express();
  app.use(context.module.exports);
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await new Promise(resolve => server.once('listening', resolve));
  const url = 'http://127.0.0.1:' + server.address().port + '/tenant/upload-knowledge';
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage().drawText('Disposable knowledge fixture', { x: 40, y: 500, font, size: 14 });
  const bytes = await doc.save();
  const token = jwt.sign({ tenant_id: 'fixture-tenant' }, secret);
  async function send(data, auth, extra = false) {
    const form = new FormData();
    form.append('file', new Blob([data], { type: 'application/pdf' }), 'fixture.pdf');
    if (extra) form.append('extra', 'not allowed');
    return fetch(url, { method: 'POST', headers: auth ? { authorization: 'Bearer ' + auth } : {}, body: form });
  }
  assert.equal((await send(bytes, null)).status, 401);
  assert.equal((await send(Buffer.from('not a pdf'), token)).status, 400);
  assert.equal((await send(bytes, token, true)).status, 400);
  assert.equal(writes.length, 0);
  assert.equal(embeddings.length, 0);
  const result = await send(bytes, token);
  assert.equal(result.status, 200, await result.clone().text());
  assert.equal((await result.json()).ok, true);
  assert.equal(writes.length, 1);
  assert.equal(writes[0][1][0], 'fixture-tenant');
  assert.ok(embeddings[0].includes('Disposable knowledge fixture'));
});
