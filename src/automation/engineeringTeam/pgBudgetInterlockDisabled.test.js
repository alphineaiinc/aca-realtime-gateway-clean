'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readInterlock, changeInterlock} = require('./pgBudgetInterlockDisabled');

test('missing singleton row and unsafe version fail closed', async () => {
 for (const result of [{rowCount: 0}, {rowCount: 1, rows: [{version: '9007199254740992', pending: null}]}]) {
  await assert.rejects(readInterlock({query: async () => result}));
 }
});

test('stale interlock update fails closed', async () => {
 await assert.rejects(changeInterlock({query: async () => ({rowCount: 0})}, {version: 1, pending: 'a'}, null), /conflict/);
});
