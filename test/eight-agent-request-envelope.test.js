'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {prepareRequestEnvelope}=require('../src/automation/engineeringTeam/requestEnvelope');
const manifest={executionAuthorized:false,evidenceSha256:'a'.repeat(64),models:{orchestrator:'fixture'},limits:{maxOutputTokens:256}};
const costEnvelope={executionAuthorized:false,evidenceSha256:'b'.repeat(64),maxInputTokens:1000,maxOutputTokens:256,ceilings:{fixture:100}};
const request={role:'orchestrator',mode:'proposal-only',input:'fixture',instructions:'test',schema:{type:'object'}};
const opts={manifest,costEnvelope,request};
test('request evidence binds payload and cost evidence without authorizing execution',()=>{
 const e=prepareRequestEnvelope(opts);
 assert.equal(e.executionAuthorized,false);
 assert.notEqual(e.evidenceSha256,prepareRequestEnvelope({...opts,request:{...request,input:'changed'}}).evidenceSha256);
 assert.notEqual(e.evidenceSha256,prepareRequestEnvelope({...opts,costEnvelope:{...costEnvelope,evidenceSha256:'c'.repeat(64)}}).evidenceSha256);
});
test('request preparation denies oversized and unauthorized roles',()=>{
 for(const changes of [{input:'x'.repeat(1000)},{role:'backend-developer'},{mode:'execute'}])assert.throws(()=>prepareRequestEnvelope({...opts,request:{...request,...changes}}));
});
