'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/routes/uploadKnowledge.js'), 'utf8');
function harness({ tenantId = 'tenant-1', pdfText = 'Knowledge text', pdfError = null } = {}) {
  let route, dbWrites = 0, embeddingCalls = 0, parserDestroyed = 0;
  class PDFParse {
    constructor() {}
    async getText() { if (pdfError) throw pdfError; return { text: pdfText }; }
    async destroy() { parserDestroyed++; }
  }
  const multer = () => ({ single: () => (req, res, next) => next() });
  multer.memoryStorage = () => ({});
  multer.MulterError = class MulterError extends Error {};
  const router = { post(name, ...handlers) { route = { name, handlers }; } };
  const mocks = {
    express: { Router: () => router }, multer,
    jsonwebtoken: { verify: () => ({ tenant_id: tenantId }) },
    'pdf-parse': { PDFParse },
    '../db/pool': { async query() { dbWrites++; } },
    '../brain/utils/embeddingManager': { async embedText() { embeddingCalls++; return [0.1, 0.2]; } },
  };
  const context = { require(name) { if (!(name in mocks)) throw new Error('Unexpected import ' + name); return mocks[name]; }, module: { exports: {} }, Buffer, console: { error() {} } };
  vm.runInNewContext(source, context, { filename: 'uploadKnowledge.js' });
  async function request(buffer, token = 'Bearer valid') {
    const req = { headers: { authorization: token }, file: buffer == null ? undefined : { buffer, originalname: 'doc.pdf' } };
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    let idx = 0;
    const run = async () => {
      const handler = route.handlers[idx++];
      if (!handler) return;
      if (handler.length >= 3) {
        let nextCalled = false;
        handler(req, res, () => { nextCalled = true; });
        if (nextCalled) await run();
      } else await handler(req, res);
    };
    await run();
    return res;
  }
  return { request, stats: () => ({ dbWrites, embeddingCalls, parserDestroyed }) };
}
test('invalid PDF signature rejects without embedding or writes', async () => {
  const h = harness();
  const res = await h.request(Buffer.from('not-a-pdf'));
  assert.equal(res.statusCode, 400);
  assert.equal(h.stats().dbWrites, 0);
  assert.equal(h.stats().embeddingCalls, 0);
});
test('large extracted text rejects before external calls and destroys parser', async () => {
  const h = harness({ pdfText: 'x'.repeat(100001) });
  const res = await h.request(Buffer.from('%PDF-1.7'));
  assert.equal(res.statusCode, 413);
  assert.deepEqual(h.stats(), { dbWrites: 0, embeddingCalls: 0, parserDestroyed: 1 });
});
test('parser exception yields generic 500 and destroys parser', async () => {
  const h = harness({ pdfError: new Error('secret parser detail') });
  const res = await h.request(Buffer.from('%PDF-1.7'));
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error, 'Upload processing failed');
  assert.equal(h.stats().parserDestroyed, 1);
});
test('valid PDF text embeds and inserts tenant-scoped chunk', async () => {
  const h = harness();
  const res = await h.request(Buffer.from('%PDF-1.7'));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.chunks, 1);
  assert.equal(h.stats().dbWrites, 1);
});
