'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/routes/uploadKnowledge.js'), 'utf8');
function harness({ tenantId = 'tenant-1', pdfText = 'Knowledge text', pdfError = null, uploadError = null, failInsert = false, failEmbedding = false } = {}) {
  let route, dbWrites = 0, embeddingCalls = 0, parserDestroyed = 0, commits = 0, rollbacks = 0;
  class PDFParse {
    constructor() {}
    async getText() { if (pdfError) throw pdfError; return { text: pdfText }; }
    async destroy() { parserDestroyed++; }
  }
  const multer = () => ({ single: () => (req, res, next) => next(uploadError) });
  multer.memoryStorage = () => ({});
  multer.MulterError = class MulterError extends Error { constructor(code) { super(code); this.code = code; } };
  if (uploadError === 'LIMIT_FILE_SIZE') uploadError = new multer.MulterError('LIMIT_FILE_SIZE');
  const router = { post(name, ...handlers) { route = { name, handlers }; } };
  const mocks = {
    express: { Router: () => router }, multer,
    jsonwebtoken: { verify: (token) => { if (token !== 'valid') throw new Error('Invalid test token'); return { tenant_id: tenantId }; } },
    'pdf-parse': { PDFParse },
    '../db/pool': { async connect() { return { async query(sql) { if (sql === 'COMMIT') commits++; else if (sql === 'ROLLBACK') rollbacks++; else if (sql.startsWith('INSERT')) { if (failInsert) throw new Error('mock insert failed'); dbWrites++; } }, release() {} }; } },
    '../brain/utils/embeddingManager': { async embedText() { embeddingCalls++; if (failEmbedding) throw new Error('mock embedding failed'); return [0.1, 0.2]; } },
  };
  const context = { require(name) { if (!(name in mocks)) throw new Error('Unexpected import ' + name); return mocks[name]; }, module: { exports: {} }, Buffer, process: { env: { JWT_SECRET: 'test-only-secret' } }, console: { error() {} } };
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
  return { request, stats: () => ({ dbWrites, embeddingCalls, parserDestroyed }), tx: () => ({ commits, rollbacks }) };
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

test('invalid JWT is rejected before PDF parsing or database activity', async () => {
  const h = harness();
  const res = await h.request(Buffer.from('%PDF-1.7'), 'Bearer invalid');
  assert.equal(res.statusCode, 401);
  assert.deepEqual(h.stats(), { dbWrites: 0, embeddingCalls: 0, parserDestroyed: 0 });
});
test('JWT missing tenant identity is rejected before PDF processing', async () => {
  const h = harness({ tenantId: null });
  const res = await h.request(Buffer.from('%PDF-1.7'));
  assert.equal(res.statusCode, 401);
  assert.equal(h.stats().dbWrites, 0);
});
test('PDF without extractable text is rejected before external calls', async () => {
  const h = harness({ pdfText: '   ' });
  const res = await h.request(Buffer.from('%PDF-1.7'));
  assert.equal(res.statusCode, 400);
  assert.deepEqual(h.stats(), { dbWrites: 0, embeddingCalls: 0, parserDestroyed: 1 });
});

test('unexpected multipart middleware error returns controlled 400 before writes', async () => {
  const err = new Error('file too large');
  const h = harness({ uploadError: err });
  // The upload handler recognizes only MulterError instances; this generic
  // error must be a controlled 400 rather than leaking details.
  const res = await h.request(Buffer.from('%PDF-1.7'));
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'Invalid upload');
  assert.deepEqual(h.stats(), { dbWrites: 0, embeddingCalls: 0, parserDestroyed: 0 });
});

test('Multer file size limit returns 413 without parsing or writes', async () => {
  const h = harness({ uploadError: 'LIMIT_FILE_SIZE' });
  const res = await h.request(Buffer.from('%PDF-1.7'));
  assert.equal(res.statusCode, 413);
  assert.equal(res.body.error, 'Invalid upload');
  assert.deepEqual(h.stats(), { dbWrites: 0, embeddingCalls: 0, parserDestroyed: 0 });
});

test('successful knowledge upload commits a single transaction', async () => {
  const h = harness({ pdfText: 'Knowledge text' });
  const res = await h.request(Buffer.from('%PDF-1.7'));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(h.tx(), { commits: 1, rollbacks: 0 });
});

test('embedding failure causes no database transaction or inserts', async () => {
  const h = harness({ failEmbedding: true });
  const res = await h.request(Buffer.from('%PDF-1.7'));
  assert.equal(res.statusCode, 500);
  assert.equal(h.stats().dbWrites, 0);
  assert.deepEqual(h.tx(), { commits: 0, rollbacks: 0 });
});
test('database insert failure rolls back and never commits', async () => {
  const h = harness({ failInsert: true });
  const res = await h.request(Buffer.from('%PDF-1.7'));
  assert.equal(res.statusCode, 500);
  assert.deepEqual(h.tx(), { commits: 0, rollbacks: 1 });
});
