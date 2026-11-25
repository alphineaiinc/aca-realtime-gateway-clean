'use strict';
// Trusted CI fixture only; no model-supplied source or shell arguments.
const assert=require('node:assert/strict');
const {createPatchPlanner,digest}=require('../../src/automation/engineeringTeam/patchPlanner');
const original='module.exports = (a,b) => a-b;';
const replacement='module.exports = (a,b) => a+b;';
const scope={product:'fixture',repository:'fixture/engineering',sha:'a'.repeat(40)};
const plan=createPatchPlanner({scope,files:[{role:'backend-developer',path:'src/example.js',text:original}]}).plan({role:'backend-developer',edits:[{path:'src/example.js',beforeSha256:digest(original),replacement}]});
assert.equal(plan.changes[0].replacement,replacement);
assert.equal(plan.executionAuthorized,false);
// Output fixed fixture bytes only, never arbitrary agent output.
process.stdout.write(plan.changes[0].replacement);
