'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createInterlock} = require('./budgetInterlockDisabled');

test('reconciliation requires pinned signing authority and a database connection', () => {
 assert.throws(() => createInterlock({keys: {}, pool: {connect() {}}}), /Missing reconciliation dependencies/);
});
