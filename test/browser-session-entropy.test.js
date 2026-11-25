const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

for (const filename of ['chat.js', 'chat_ui_streaming.js']) {
  test(filename + ' uses cryptographic session identifiers without Math.random', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../public/dashboard', filename), 'utf8');
    assert.doesNotMatch(source, /Math\.random\s*\(/);
    const match = source.match(/(?:function newSessionId\(\)\s*\{\s*return |const sid =\s*localStorage\.getItem\(sidKey\) \|\|\s*\()([^;\n]+)/);
    assert.ok(match, 'session identifier expression must be present');
    const ids = [];
    const context = { globalThis: { crypto: { randomUUID: () => { const id = 'unique-' + ids.length; ids.push(id); return id; } } }, Math: { random: () => { throw new Error('insecure random called'); } }, Date: { now: () => { throw new Error('timestamp used as entropy'); } } };
    const expression = filename === 'chat.js' ? match[1].replace(/\)\s*$/, '') : match[1].trim();
    const result = vm.runInNewContext(expression, context);
    assert.equal(result, 'webchat_unique-0');
    assert.equal(ids.length, 1);
  });
}
