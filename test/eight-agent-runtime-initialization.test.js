'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {generateKeyPairSync}=require('node:crypto');
const {roles}=require('../src/automation/engineeringTeam/registry');
const {initializeRuntime}=require('../src/automation/engineeringTeam/runtimeInitialization');
const {publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const scope={product:'aca',repository:'fixture/aca',sha:'a'.repeat(40)};
const config={scope,models:Object.fromEntries(Object.keys(roles).map(r=>[r,'fixture'])),budgetId:'11111111-1111-1111-1111-111111111111',paths:['src/example.js'],issue:42,runnerImage:'node@sha256:'+'b'.repeat(64),limits:{maxCalls:8,maxOutputTokens:2000,maxSpendMicrousd:1000000}};
const opts={config,pool:{query:async()=>assert.fail('database touched on initialization'),connect:async()=>assert.fail('database touched on initialization')},identity:{publicKey:publicKey.export({type:'spki',format:'pem'}),issuer:'fixture',audience:'fixture',principals:[{...scope,id:'manager',permission:'queue.manage'}],isRevoked:async()=>false},ceilings:{fixture:100}};
test('initialization composes durable components without touching database or activating execution',()=>{
 const runtime=initializeRuntime(opts);
 assert.equal(runtime.status,'initialized-inert');assert.equal(runtime.executionAllowed(),false);assert.equal(runtime.approvals.executionAllowed(),false);
 assert.equal(runtime.providerOutcome,null);
 assert.equal(runtime.queue,null);assert.equal(typeof runtime.budget.reserve,'function');
 assert.equal(typeof runtime.governanceAlerts.list,'function');
});
test('missing budget ceilings or transactional pool fails closed',()=>{
 assert.throws(()=>initializeRuntime({...opts,ceilings:{}}));
 assert.throws(()=>initializeRuntime({...opts,pool:{query:async()=>{}}}));
});

test('runtime reservation requires pinned independent reviewer configuration',()=>{
 const readQueueState=async()=>assert.fail('policy touched during initialization');
 assert.equal(initializeRuntime({...opts,readQueueState}).providerReservation,null);
 const {publicKey}=generateKeyPairSync('ed25519');
 const independentReview={publicKey,reviewerId:'reviewer',authorIds:['author'],isRevoked:async()=>false};
 assert.equal(initializeRuntime({...opts,readQueueState,independentReview}).providerReservation,null);
 const costConfig={maxInputTokens:1000,prices:{fixture:{input:50000,output:25000}}};
 const runtime=initializeRuntime({...opts,readQueueState,independentReview,costConfig});
 assert.equal(runtime.costEnvelope.ceilings.fixture,100);
 assert.throws(()=>initializeRuntime({...opts,readQueueState,independentReview,costConfig,ceilings:{fixture:99}}),/Cost ceiling mismatch/);
 assert.equal(typeof runtime.providerReservation.reserve,'function');
 assert.equal(typeof runtime.providerOutcome.record,'function');
 assert.equal(runtime.executionAllowed(),false);
 assert.throws(()=>initializeRuntime({...opts,readQueueState,independentReview:{...independentReview,authorIds:['reviewer']}}));
});

test('runtime exposes no raw queue without current policy evidence',()=>{
 const runtime=initializeRuntime({...opts,readQueueState:async()=>assert.fail('policy is evaluated only on admission')});
 assert.equal(runtime.queue!==null,true);
 assert.equal(runtime.queue.executionAllowed(),false);
});
test('runtime policy-bound queue denies a blocked issue before touching PostgreSQL',async()=>{
 let reads=0;
 const runtime=initializeRuntime({...opts,readQueueState:async()=>{reads++;return {
  repository:scope.repository,headSha:scope.sha,
  issue:{number:42,state:'open',isPullRequest:false,labels:[],assignees:[]},
  activeIssueNumbers:[]
 };}});
 await assert.rejects(runtime.queue.enqueue({scope,role:'orchestrator',credential:'manager'}),/Queue policy denied/);
 assert.equal(reads,1);
});
