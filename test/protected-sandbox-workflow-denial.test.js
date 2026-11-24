'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const yaml=fs.readFileSync('.github/workflows/protected-fixed-fixture.yml','utf8');
test('protected sandbox workflow remains dispatch-only, permissionless and denial-only',()=>{
 assert.match(yaml,/workflow_dispatch:/);
 assert.match(yaml,/permissions:\s*\{\}/);
 assert.match(yaml,/runs-on:\s*ubuntu-24\.04/);
 assert.match(yaml,/exit 1/);
 assert.doesNotMatch(yaml,/pull_request:|push:|workflow_run:|secrets\.|id-token:\s*write|contents:\s*write|packages:\s*write/);
});
test('proposed runtime workflow is not the active workflow',()=>{
 const active=fs.readFileSync('.github/workflows/protected-fixed-fixture.yml','utf8');
 const proposed=fs.readFileSync('scripts/protected-sandbox/runtime-workflow.proposed.yml','utf8');
 assert.notEqual(active,proposed);
 assert.match(active,/review-hold/);
 assert.match(active,/execution withheld/);
});
