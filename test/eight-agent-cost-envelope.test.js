'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {roles}=require('../src/automation/engineeringTeam/registry');
const {createActivationManifest}=require('../src/automation/engineeringTeam/activationManifest');
const {createCostEnvelope}=require('../src/automation/engineeringTeam/costEnvelope');
const manifest=createActivationManifest({scope:{product:'aca',repository:'fixture/aca',sha:'a'.repeat(40)},models:Object.fromEntries(Object.keys(roles).map(r=>[r,'fixture'])),budgetId:'11111111-1111-1111-1111-111111111111',paths:['src/example.js'],issue:42,runnerImage:'node@sha256:'+'b'.repeat(64),limits:{maxCalls:8,maxOutputTokens:256,maxSpendMicrousd:10000}});
const opts={manifest,maxInputTokens:1000,prices:{fixture:{input:100000,output:200000}}};
test('cost envelope rounds up and binds model pricing to exact manifest',()=>{
 const e=createCostEnvelope(opts);
 assert.equal(e.ceilings.fixture,152);
 assert.equal(e.executionAuthorized,false);
 assert.notEqual(e.evidenceSha256,createCostEnvelope({...opts,maxInputTokens:1001}).evidenceSha256);
 assert.ok(Object.isFrozen(e.ceilings));
});
test('cost envelope denies missing pricing, invalid bounds and aggregate overspend',()=>{
 for(const changes of [{prices:{}},{maxInputTokens:0},{prices:{fixture:{input:1.5,output:2}}},{prices:{fixture:{input:2000000,output:200000}}},{manifest:{...manifest,evidenceSha256:'f'.repeat(64)}}])assert.throws(()=>createCostEnvelope({...opts,...changes}));
});
