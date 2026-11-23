const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'src/routes/uploadKnowledge.js'), 'utf8');

test('upload uses bounded in-memory Multer storage', () => {
  assert.match(source, /multer\.memoryStorage\(\)/);
  assert.match(source, /fileSize: 10 \* 1024 \* 1024/);
  assert.match(source, /files: 1/);
});

test('upload never opens or deletes a request-derived filesystem path', () => {
  assert.doesNotMatch(source, /fs\.(?:readFileSync|unlinkSync|createReadStream|rmSync)/);
  assert.doesNotMatch(source, /req\.file\.path/);
  assert.match(source, /req\.file\.buffer/);
});

test('upload validates PDF signature and does not reflect parser exceptions', () => {
  assert.match(source, /%PDF-/);
  assert.doesNotMatch(source, /error: err\.message/);
});

test('pdf-parse v2 parser API is used with guaranteed cleanup', () => {
  assert.match(source, /const \{ PDFParse \} = require\("pdf-parse"\)/);
  assert.match(source, /new PDFParse\(\{ data: dataBuffer \}\)/);
  assert.match(source, /await parser\.getText\(\)/);
  assert.match(source, /finally \{\s*await parser\.destroy\(\)/);
  assert.doesNotMatch(source, /await pdfParse\(dataBuffer\)/);
});

test('oversized and malformed uploads get controlled client errors', () => {
  assert.match(source, /err instanceof multer\.MulterError/);
  assert.match(source, /err\.code === "LIMIT_FILE_SIZE" \? 413 : 400/);
  assert.match(source, /authenticate, reserveUpload, acceptPdfUpload, async/);
});

test('PDF parsing bounds downstream embedding costs before writes', () => {
  assert.match(source, /text\.length > 100_000/);
  assert.match(source, /fields: 0, parts: 2/);
  assert.ok(source.indexOf('text.length > 100_000') < source.indexOf('await embedText(content)'));
  assert.ok(source.indexOf('text.length > 100_000') < source.indexOf('await pool.query('));
});
