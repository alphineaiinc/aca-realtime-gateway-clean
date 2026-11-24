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
      if (name === '../db/pool') return { query: async (...args) => { if(args[0].includes('aca_business_identities')) return {rows:args[1][0]==='fixture@example.test'&&args[1][1]===42?[{tenant_id:42}]:[]}; writes.push(args); } };
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
  const token = jwt.sign({ tenant_id: 42, purpose:'verified_business', sub:'fixture@example.test' }, secret,{issuer:'alphine-ai',audience:'aca-business',algorithm:'HS256'});
  async function send(data, auth, extra = false) {
    const form = new FormData();
    form.append('file', new Blob([data], { type: 'application/pdf' }), 'fixture.pdf');
    if (extra) form.append('extra', 'not allowed');
    return fetch(url, { method: 'POST', headers: auth ? { authorization: 'Bearer ' + auth } : {}, body: form });
  }
  assert.equal((await send(bytes, null)).status, 401);
  assert.equal((await send(bytes, jwt.sign({tenant_id:42},secret))).status,401);
  assert.equal((await send(Buffer.from('not a pdf'), token)).status, 400);
  assert.equal((await send(bytes, token, true)).status, 400);
  assert.equal(writes.length, 0);
  assert.equal(embeddings.length, 0);
  const result = await send(bytes, token);
  assert.equal(result.status, 200, await result.clone().text());
  assert.equal((await result.json()).ok, true);
  assert.equal(writes.length, 1);
  assert.equal(writes[0][1][0], 42);
  assert.ok(embeddings[0].includes('Disposable knowledge fixture'));
});
