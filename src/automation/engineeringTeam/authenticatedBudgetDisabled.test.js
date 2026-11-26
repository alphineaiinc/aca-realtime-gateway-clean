'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createAuthenticatedBudget} = require('./authenticatedBudgetDisabled');

test('missing pinned signing authority is denied without database access', () => {
 assert.throws(() => createAuthenticatedBudget({keys: {}}), /Missing trust roots/);
});
