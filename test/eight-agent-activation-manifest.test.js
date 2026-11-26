'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {roles}=require('../src/automation/engineeringTeam/registry');
const {createActivationManifest}=require('../src/automation/engineeringTeam/activationManifest');
const config={scope:{product:'aca',repository:'fixture/aca',sha:'a'.repeat(40)},models:Object.fromEntries(Object.keys(roles).map(r=>[r,'fixture'])),budgetId:'11111111-1111-1111-1111-111111111111',paths:['src/example.js'],issue:42,runnerImage:'node@sha256:'+'b'.repeat(64),limits:{maxCalls:8,maxOutputTokens:2000,maxSpendMicrousd:1000000}};
test('manifest binds eight model choices and exact scope without activation authority',()=>{
 const m=createActivationManifest(config);
 assert.equal(m.executionAuthorized,false);assert.equal(m.mode,'proposal-only');assert.equal(m.evidenceSha256,createActivationManifest(config).evidenceSha256);
 assert.notEqual(m.evidenceSha256,createActivationManifest({...config,scope:{...config.scope,sha:'c'.repeat(40)}}).evidenceSha256);
});
test('manifest rejects unpinned image, missing roles, unsafe path and unbounded budget',()=>{
 for(const change of [{runnerImage:'node:latest'},{models:{}},{paths:['src/../secret.js']},{limits:{...config.limits,maxCalls:100}}])assert.throws(()=>createActivationManifest({...config,...change}));
});
