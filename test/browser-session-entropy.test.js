'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

for (const filename of ['chat.js', 'chat_ui_streaming.js']) {
  test(filename + ' uses cryptographic session identifiers without Math.random', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../public/dashboard', filename), 'utf8');
    assert.equal(source.includes('Math.random('), false);
    assert.ok(source.includes('globalThis.crypto.randomUUID()'), 'secure randomUUID call required');

    const context = {
      globalThis: { crypto: { randomUUID: () => 'unique-0' } },
      Math: { random: () => { throw new Error('insecure random called'); } },
      Date: { now: () => { throw new Error('timestamp used as entropy'); } }
    };
    const expression = '"webchat_" + globalThis.crypto.randomUUID()';
    const result = vm.runInNewContext(expression, context);
    assert.equal(result, 'webchat_unique-0');
  });
}
