'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {generateKeyPairSync}=require('node:crypto');
const {roles}=require('../src/automation/engineeringTeam/registry');
const {initializeRuntime}=require('../src/automation/engineeringTeam/runtimeInitialization');
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const scope={product:'development-automation',repository:'alphineaiinc/aca-realtime-gateway-clean',sha:'a'.repeat(40)};
const config={scope,models:Object.fromEntries(Object.keys(roles).map(r=>[r,'fixture'])),budgetId:'11111111-1111-1111-1111-111111111111',paths:['src/automation/engineeringTeam/example.js'],issue:42,runnerImage:'node@sha256:'+'b'.repeat(64),limits:{maxCalls:8,maxOutputTokens:2000,maxSpendMicrousd:1000000}};
const projectAuthority={project:scope.product,repository:scope.repository,sourceSha:scope.sha,issue:42,taskId:'S3-04',branch:'automation/stage3-fixture',purpose:'automation-preparation',authorization:'owner-approved-preparation',transferRequested:false,paths:config.paths};
const jwt=require('jsonwebtoken');
const {digest}=require('../src/automation/engineeringTeam/patchPlanner');
const {createActivationManifest}=require('../src/automation/engineeringTeam/activationManifest');
const projectOwnerCredential=jwt.sign({...scope,permission:'owner.approval',purpose:'automation-preparation',projectBoundaryDigest:digest(JSON.stringify(['alphine-project-boundary-v1',createActivationManifest(config).evidenceSha256,projectAuthority]))},privateKey,{algorithm:'RS256',issuer:'fixture',audience:'fixture',subject:'owner',jwtid:'fixture-owner',expiresIn:300});
const opts={config,projectAuthority,projectOwnerCredential,pool:{query:async()=>assert.fail('database touched on initialization'),connect:async()=>assert.fail('database touched on initialization')},identity:{publicKey:publicKey.export({type:'spki',format:'pem'}),issuer:'fixture',audience:'fixture',principals:[{...scope,id:'manager',permission:'queue.manage'},{...scope,id:'owner',permission:'owner.approval'}],isRevoked:async()=>false},ceilings:{fixture:100}};
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
 const runtime=initializeRuntime({...opts,readQueueState:async request=>{reads++;return {
  projectBoundary:request.projectBoundary,boundaryDigest:request.boundaryDigest,
  repository:scope.repository,headSha:scope.sha,
  issue:{number:42,state:'open',isPullRequest:false,labels:[],assignees:[]},
  activeIssueNumbers:[]
 };}});
 await assert.rejects(runtime.queue.enqueue({scope,role:'orchestrator',credential:'manager'}),/Queue policy denied/);
 assert.equal(reads,1);
});

test('runtime rejects missing and mismatched project authority before any queue access',()=>{
 const readQueueState=async()=>assert.fail('queue read');
 for(const projectAuthority of [undefined,{...opts.projectAuthority,project:'aca'},{...opts.projectAuthority,branch:'main'},{...opts.projectAuthority,taskId:'P3-02'}])assert.throws(()=>initializeRuntime({...opts,projectAuthority,readQueueState}),/Project boundary denied/);
});

test('runtime denies unverified owner credentials before queue or database access',async()=>{const runtime=initializeRuntime({...opts,projectOwnerCredential:'forged',readQueueState:async()=>assert.fail('queue read')});await assert.rejects(runtime.queue.enqueue({scope,role:'orchestrator',credential:'manager'}),/Project owner authority denied/);});

test('preparation credential cannot record general privileged approval; unbound owner still can',async()=>{
 let writes=0;
 const runtime=initializeRuntime({...opts,pool:{...opts.pool,query:async()=>{writes++;return {rowCount:1,rows:[{state:'approved'}]};}}});
 const decision={scope,id:'123e4567-e89b-42d3-a456-426614174000',binding:'b'.repeat(64),decision:'approved'};
 await assert.rejects(runtime.approvals.recordDecision({...decision,credential:projectOwnerCredential}),/Identity denied/);
 assert.equal(writes,0);
 const general=jwt.sign({...scope,permission:'owner.approval'},privateKey,{algorithm:'RS256',issuer:'fixture',audience:'fixture',subject:'owner',jwtid:'general-owner',expiresIn:60});
 assert.equal((await runtime.approvals.recordDecision({...decision,credential:general})).state,'approved');
 assert.equal(writes,1);
});
test('runtime revalidates owner after connection and scope lock before enqueue or claim',async()=>{
 for(const operation of ['enqueue','claim'])for(const change of ['connection','lock','governance','unchanged']){
  let revoked=false;const queries=[];
  const query=async sql=>{queries.push(sql);
   if(change==='lock'&&sql.startsWith('SELECT pg_advisory'))revoked=true;
   if(change==='governance'&&sql.startsWith('SELECT EXISTS'))revoked=true;
   return {rowCount:1,rows:[{blocked:false,id:'fixture'}]};
  };
  const identity={...opts.identity,principals:[...opts.identity.principals,{...scope,id:'worker',permission:'queue.work',role:'orchestrator'}],isRevoked:async({id})=>id==='owner'&&revoked};
  const actor=jwt.sign({...scope,permission:operation==='enqueue'?'queue.manage':'queue.work',...(operation==='claim'?{role:'orchestrator'}:{})},privateKey,{algorithm:'RS256',issuer:'fixture',audience:'fixture',subject:operation==='enqueue'?'manager':'worker',jwtid:'actor',expiresIn:60});
  const runtime=initializeRuntime({...opts,identity,pool:{query,connect:async()=>{if(change==='connection')revoked=true;return {query,release(){}};}},readQueueState:async r=>({projectBoundary:r.projectBoundary,boundaryDigest:r.boundaryDigest,repository:scope.repository,headSha:scope.sha,issue:{number:42,state:'open',isPullRequest:false,labels:['aca:auto/docs-test'],assignees:[]},activeIssueNumbers:[]})});
  const invoke=()=>runtime.queue[operation]({scope,role:'orchestrator',credential:actor,admissionGuard:async()=>true});
  if(change==='unchanged'){await invoke();assert.ok(queries.includes('COMMIT'));assert.ok(queries.some(s=>s.startsWith('WITH ')));}
  else{await assert.rejects(invoke(),/Project owner authority denied/);assert.ok(queries.includes('ROLLBACK'));assert.ok(!queries.includes('COMMIT'));assert.ok(!queries.some(s=>s.startsWith('WITH ')));}
 }
});
