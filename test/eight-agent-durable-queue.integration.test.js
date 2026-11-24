'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {Pool}=require('pg');
const {createProviderReservation}=require('../src/automation/engineeringTeam/providerReservation');
const {createActivationManifest}=require('../src/automation/engineeringTeam/activationManifest');
const {createQueuePolicyBridge}=require('../src/automation/engineeringTeam/queuePolicyBridge');
const {createFixtureRuntime}=require('../src/automation/engineeringTeam/fixtureRuntime');
const {createChangePreparation}=require('../src/automation/engineeringTeam/changePreparation');
const {digest}=require('../src/automation/engineeringTeam/patchPlanner');
const {createAgentManager}=require('../src/automation/engineeringTeam/manager');
const {createQueueWorker}=require('../src/automation/engineeringTeam/queueWorker');
const {contract}=require('../src/automation/engineeringTeam/contracts');
const {createPublicationReservation,publicationBinding:computePublicationBinding}=require('../src/automation/engineeringTeam/publicationReservation');
const {createWorkflowLedger}=require('../src/automation/engineeringTeam/workflowLedger');
const {sequence}=require('../src/automation/engineeringTeam/offlineTeam');
const {randomUUID}=require('node:crypto');
const {createCallBudget}=require('../src/automation/engineeringTeam/callBudget');
const {createSpendBudget}=require('../src/automation/engineeringTeam/spendBudget');
const {createDurableQueue}=require('../src/automation/engineeringTeam/durableQueue');
const {createDurableApprovalPolicy}=require('../src/automation/engineeringTeam/durableApproval');
test('isolated PostgreSQL queue: concurrent claims, retries, restart, expiry and cancellation',{skip:process.env.RUN_ENGINEERING_QUEUE_CI!=='1',timeout:30000},async t=>{
 const url=new URL(process.env.ENGINEERING_QUEUE_CI_DATABASE_URL);
 assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/aca_engineering_queue_ci');
 const pools=[new Pool({connectionString:url.toString(),max:4}),new Pool({connectionString:url.toString(),max:4})];
 t.after(async()=>{await Promise.all(pools.map(p=>p.end()));});
 await pools[0].query(fs.readFileSync(path.join(__dirname,'../migrations/draft_engineering_team_queue.sql'),'utf8'));
 const scope={product:'aca',repository:'fixture/aca',sha:'a'.repeat(40)},role='backend-developer';
 const identities=new Map([['manager',{...scope,id:'manager',permission:'queue.manage'}],...['w1','w2'].map(id=>[id,{...scope,id,role,permission:'queue.work'}])]);
 const make=pool=>createDurableQueue({pool,scopes:[scope],authenticate:async c=>identities.get(c)});
 const q=make(pools[0]),q2=make(pools[1]);
 const {createCiEventAdmission}=require('../src/automation/engineeringTeam/ciEventAdmission');
 const admission=(pool,credential='manager')=>createCiEventAdmission({pool,scope,workflowId:42,authenticate:async c=>identities.get(c),credential});
 const event={scope,workflowId:42,runId:123,attempt:1};
 assert.equal(await admission(pools[0],'w1')(event),false);
 assert.equal(await admission(pools[0])({...event,scope:{...scope,sha:'b'.repeat(40)}}),false);
 const admissions=await Promise.all(pools.map(pool=>admission(pool)(event)));
 assert.equal(admissions.filter(Boolean).length,1);
 assert.equal(await admission(pools[1])(event),false);
 assert.equal(await admission(pools[1])({...event,attempt:2}),true);
 const stopScope={...scope,repository:'fixture/stopped'};
 const stoppedAdmission=createCiEventAdmission({pool:pools[0],scope:stopScope,workflowId:42,authenticate:async()=>({...stopScope,id:'manager',permission:'queue.manage'}),credential:'fixture'});
 await pools[0].query('INSERT INTO engineering_team_stops(product,repository,actor_id) VALUES ($1,$2,$3)',[stopScope.product,stopScope.repository,'manager']);
 assert.equal(await stoppedAdmission({...event,scope:stopScope}),false);

 const {createContinuationRuntime}=require('../src/automation/engineeringTeam/continuationRuntime');
 const continuationTask=await q.enqueue({scope,role,credential:'manager'});
 const continuationRun={id:456,run_attempt:1,workflow_id:42,repository:{full_name:scope.repository},head_sha:scope.sha,status:'completed',conclusion:'success'};
 const continuationPolicy={evaluate:async()=>({scope,issueNumber:42,manifestDigest:'c'.repeat(64),policyVersion:'v1',eligibleForPreparation:true,executionAuthorized:false,evidenceSha256:'d'.repeat(64)})};
 const continuationConfig={scope,workflowId:42,authenticate:async c=>identities.get(c),managerCredential:'manager',workerCredential:'w1',role,readRun:async()=>continuationRun,queue:q,policy:continuationPolicy,issue:42,manifestDigest:'c'.repeat(64),manager:{createTask:()=>({id:'fixture'}),propose:async()=>({role,approval:false,output:{fixture:true}})},loadTask:async ({id})=>({id,...scope,subject:'fixture continuation'})};
 const continuation=createContinuationRuntime({...continuationConfig,pool:pools[0]});
 const {createCiCompletionEvent}=require('../src/automation/engineeringTeam/ciCompletionEvent');
 const {createHmac}=require('node:crypto');
 const secret='disposable-ci-fixture-secret-only';
 const body=Buffer.from(JSON.stringify({action:'completed',repository:{full_name:scope.repository},workflow_run:continuationRun}));
 const signature='sha256='+createHmac('sha256',secret).update(body).digest('hex');
 const handle=createCiCompletionEvent({secret,repository:scope.repository,workflowId:42,runtime:continuation});
 const drained=await handle({body,signature,eventType:'workflow_run'});
 assert.equal(drained.state,'drained');
 assert.equal(drained.result.succeeded,1);
 assert.equal(drained.result.reason,'idle');
 assert.equal(continuation.executionAllowed(),false);
 assert.equal((await createContinuationRuntime({...continuationConfig,pool:pools[1]}).onCompletion({runId:456,attempt:1})).state,'duplicate-or-denied');
 assert.equal((await pools[0].query('SELECT state FROM engineering_team_tasks WHERE id=$1',[continuationTask])).rows[0].state,'succeeded');
 // A successful CI receipt must not override a subsequently closed issue policy.
 const blockedTask=await q.enqueue({scope,role,credential:'manager'});
 const blockedRun={...continuationRun,id:457};
 const blockedPolicy={evaluate:async()=>({scope,issueNumber:42,manifestDigest:'c'.repeat(64),policyVersion:'v1',eligibleForPreparation:false,executionAuthorized:false,evidenceSha256:'e'.repeat(64)})};
 const blockedRuntime=createContinuationRuntime({...continuationConfig,pool:pools[0],readRun:async()=>blockedRun,policy:blockedPolicy,manager:{createTask:()=>({id:'must-not-create'}),propose:async()=>assert.fail('blocked policy must not propose')},loadTask:async()=>assert.fail('blocked policy must not load task')});
 const blockedResult=await blockedRuntime.onCompletion({runId:457,attempt:1});
 assert.equal(blockedResult.state,'drained');
 assert.equal(blockedResult.result.reason,'idle');
 assert.equal((await pools[0].query('SELECT state FROM engineering_team_tasks WHERE id=$1',[blockedTask])).rows[0].state,'queued');
 assert.equal(await q.cancel({scope,credential:'manager',taskId:blockedTask}),true);
 assert.equal((await pools[0].query('SELECT state FROM engineering_team_tasks WHERE id=$1',[blockedTask])).rows[0].state,'cancelled');
 assert.equal(blockedRuntime.executionAllowed(),false);
 continuation.stop();
 assert.equal((await continuation.onCompletion({runId:456,attempt:1})).state,'stopped');
 const id=await q.enqueue({scope,role,credential:'manager'});
 const claims=await Promise.all([q.claim({scope,role,credential:'w1'}),q2.claim({scope,role,credential:'w2'})]);
 assert.equal(claims.filter(Boolean).length,1);
 const winner=claims[0]?'w1':'w2',loser=winner==='w1'?'w2':'w1',lease=claims.find(Boolean);
 const finish={scope,role,taskId:id,leaseId:lease.lease_id,outcome:'failed'};
 await assert.rejects(q2.finish({...finish,credential:loser}),/Lease denied/);
 assert.equal(await q2.finish({...finish,credential:winner}),'queued');
 const retry=await make(pools[1]).claim({scope,role,credential:loser});
 assert.equal(retry.attempts,2);assert.notEqual(retry.lease_id,lease.lease_id);
 await assert.rejects(q.finish({...finish,credential:winner}),/Lease denied/);
 assert.equal(await q.finish({...finish,credential:loser,leaseId:retry.lease_id}),'failed');
 const expired=await q.enqueue({scope,role,credential:'manager'});
 const e=await q.claim({scope,role,credential:'w1'});
 await pools[0].query("UPDATE engineering_team_tasks SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[expired]);
 await assert.rejects(q.finish({scope,role,credential:'w1',taskId:expired,leaseId:e.lease_id,outcome:'succeeded'}),/Lease denied/);
 assert.equal(await q2.expire({scope,credential:'manager'}),1);
 assert.equal(await q.claim({scope,role,credential:'w1'}),null);
 const cancelled=await q.enqueue({scope,role,credential:'manager'});
 assert.equal(await q2.cancel({scope,credential:'manager',taskId:cancelled}),true);
 assert.equal(await q.claim({scope,role,credential:'w1'}),null);
 const audit=(await pools[0].query('SELECT event FROM engineering_team_queue_audit WHERE task_id=$1 ORDER BY id',[id])).rows.map(r=>r.event);
 assert.deepEqual(audit,['queued','claimed','retry','claimed','failed']);
 const evidenceTask=await q.enqueue({scope,role,credential:'manager'});
 const evidenceLease=await q.claim({scope,role,credential:'w1'});
 const evidenceSha256='b'.repeat(64);
 assert.equal(await q.finish({scope,role,credential:'w1',taskId:evidenceTask,leaseId:evidenceLease.lease_id,outcome:'succeeded',evidenceSha256}),'succeeded');
 const receipt=(await pools[1].query('SELECT lease_id,evidence_sha256 FROM engineering_team_proposal_receipts WHERE task_id=$1',[evidenceTask])).rows[0];
 assert.deepEqual(receipt,{lease_id:evidenceLease.lease_id,evidence_sha256:evidenceSha256});
 await assert.rejects(q.finish({scope,role,credential:'w1',taskId:evidenceTask,leaseId:evidenceLease.lease_id,outcome:'succeeded',evidenceSha256}),/Lease denied/);
 const {createCorrectionAdmission}=require('../src/automation/engineeringTeam/correctionAdmission');
 const correctionAdmission=(pool,credential='manager')=>createCorrectionAdmission({pool,scope,authenticate:async c=>identities.get(c),credential});
 const correctionInput={taskId:evidenceTask,initialDigest:evidenceSha256};
 assert.equal(await correctionAdmission(pools[0],'w1')(correctionInput),false);
 assert.equal(await correctionAdmission(pools[0])({...correctionInput,initialDigest:'f'.repeat(64)}),false);
 assert.equal(await correctionAdmission(pools[0])({...correctionInput,taskId:randomUUID()}),false);
 const correctionResults=await Promise.all(pools.map(pool=>correctionAdmission(pool)(correctionInput)));
 assert.equal(correctionResults.filter(Boolean).length,1);
 assert.equal(await correctionAdmission(pools[1])(correctionInput),false);
 assert.equal((await pools[0].query('SELECT initial_digest FROM engineering_team_correction_cycles WHERE task_id=$1',[evidenceTask])).rows[0].initial_digest,evidenceSha256);
 // Exercise the complete durable correction cycle against PostgreSQL, not a mocked admission adapter.
 const {createPatchPlanner}=require('../src/automation/engineeringTeam/patchPlanner');
 const {createDurableCorrectionRuntime}=require('../src/automation/engineeringTeam/durableCorrectionRuntime');
 const correctionFiles=[{path:'src/correction-fixture.js',role:'backend-developer',text:'module.exports = 1;'}];
 const correctionEdits=replacement=>[{path:correctionFiles[0].path,beforeSha256:digest(correctionFiles[0].text),replacement}];
 const initialCorrectionPlan=createPatchPlanner({scope,files:correctionFiles}).plan({role:'backend-developer',edits:correctionEdits('module.exports = broken;')});
 const correctionTask=await q.enqueue({scope,role:'backend-developer',credential:'manager'});
 const correctionLease=await q.claim({scope,role:'backend-developer',credential:'w1'});
 assert.equal(correctionLease.id,correctionTask);
 await q.finish({scope,role:'backend-developer',credential:'w1',taskId:correctionTask,leaseId:correctionLease.lease_id,outcome:'succeeded',evidenceSha256:initialCorrectionPlan.evidenceSha256});
 let correctionRuns=0,correctionProposals=0,correctionReviews=0;
 const durableCorrection=createDurableCorrectionRuntime({pool:pools[0],scope,authenticate:async c=>identities.get(c),managerCredential:'manager',files:correctionFiles,role:'backend-developer',requiredChecks:['syntax','node-tests'],authorize:async()=>true,
  proposeEdits:async()=>{correctionProposals++;return correctionEdits('module.exports = 2;');},
  runIsolated:async({plan,checks,profile})=>{correctionRuns++;return {evidenceSha256:plan.evidenceSha256,profile,checks:checks.map(name=>({name,status:correctionRuns===1&&name==='node-tests'?'failed':'passed'}))};},
  reviewCandidate:async({candidate})=>{correctionReviews++;return {role:'security-reviewer',disposition:'recommend-review',evidenceSha256:candidate.evidenceSha256};}});
 const correctionResult=await durableCorrection.run({taskId:correctionTask,edits:correctionEdits('module.exports = broken;')});
 assert.equal(correctionResult.state,'candidate-passed');
 assert.equal(correctionResult.attempts,1);
 assert.equal(correctionResult.review.role,'security-reviewer');
 assert.equal(correctionResult.review.disposition,'recommend-review');
 assert.equal(correctionResult.executionAuthorized,false);
 assert.equal(correctionResult.releaseApproved,false);
 assert.deepEqual({correctionRuns,correctionProposals,correctionReviews},{correctionRuns:2,correctionProposals:1,correctionReviews:1});
 assert.equal((await pools[1].query('SELECT initial_digest FROM engineering_team_correction_cycles WHERE task_id=$1',[correctionTask])).rows[0].initial_digest,initialCorrectionPlan.evidenceSha256);
 await assert.rejects(durableCorrection.run({taskId:correctionTask,edits:correctionEdits('module.exports = broken;')}),/consumed/);
 identities.set('owner',{...scope,id:'owner',permission:'owner.approval'});
 identities.set('self',{...scope,id:'manager',permission:'owner.approval'});
 const approval=pool=>createDurableApprovalPolicy({pool,scopes:[scope],authenticate:async c=>identities.get(c)});
 const req=await approval(pools[0]).request({scope,operation:'provider.activate',evidence:'c'.repeat(64),credential:'manager'});
 const decision={scope,id:req.id,binding:req.binding,decision:'approved'};
 await assert.rejects(approval(pools[1]).recordDecision({...decision,credential:'self'}),/Decision denied/);
 await assert.rejects(approval(pools[1]).recordDecision({...decision,credential:'w1'}),/Identity denied/);
 const decisions=await Promise.allSettled(pools.map(pool=>approval(pool).recordDecision({...decision,credential:'owner'})));
 assert.equal(decisions.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(decisions.find(x=>x.status==='fulfilled').value.executionAuthorized,false);
 assert.equal(approval(pools[1]).executionAllowed(),false);
 const budgetId=randomUUID();
 await pools[0].query('INSERT INTO engineering_team_call_budgets(product,repository,budget_id,max_calls) VALUES ($1,$2,$3,2)',[scope.product,scope.repository,budgetId]);
 const budgets=pools.map(pool=>createCallBudget({pool,...scope,budgetId}));
 const reservations=await Promise.allSettled([budgets[0].reserve(),budgets[1].reserve(),budgets[0].reserve()]);
 assert.equal(reservations.filter(x=>x.status==='fulfilled').length,2);
 await assert.rejects(createCallBudget({pool:pools[1],...scope,budgetId}).reserve(),/budget denied/);
 const spendId=randomUUID();
 await pools[0].query('INSERT INTO engineering_team_spend_budgets(product,repository,budget_id,max_calls,max_microusd) VALUES ($1,$2,$3,8,1000)',[scope.product,scope.repository,spendId]);
 const spend=pools.map(pool=>createSpendBudget({pool,...scope,budgetId:spendId,ceilings:{fixture:400}}));
 const spendResults=await Promise.allSettled([spend[0].reserve({model:'fixture'}),spend[1].reserve({model:'fixture'}),spend[0].reserve({model:'fixture'})]);
 assert.equal(spendResults.filter(x=>x.status==='fulfilled').length,2);
 await assert.rejects(spend[1].reserve({model:'unknown'}),/Unknown model/);
 const balance=(await pools[1].query('SELECT reserved_calls,reserved_microusd FROM engineering_team_spend_budgets WHERE budget_id=$1',[spendId])).rows[0];
 assert.deepEqual(balance,{reserved_calls:2,reserved_microusd:'800'});
 const ledger=pool=>createWorkflowLedger({pool,scope,authenticate:async c=>identities.get(c)});
 await assert.rejects(ledger(pools[0]).create('manager',{subject:'partial input only'}),/Workflow input denied/);
 await assert.rejects(pools[0].query('INSERT INTO engineering_team_workflows(id,product,repository,head_sha,subject) VALUES ($1,$2,$3,$4,$5)',[randomUUID(),scope.product,scope.repository,scope.sha,'partial schema input']),/engineering_team_workflows_check/);
 const workflow=await ledger(pools[0]).create('manager');
 const fixtureQueue=createDurableQueue({pool:pools[0],scopes:[scope],authenticate:async c=>identities.get(c),fixtureProposalStorage:true});
 await assert.rejects(ledger(pools[1]).advance({credential:'manager',id:workflow.id,step:0,taskId:evidenceTask}),/Handoff denied/);
 for(const [step,agentRole] of sequence.entries()){
  const credential='worker-'+step;
  identities.set(credential,{...scope,id:credential,permission:'queue.work',role:agentRole});
  const taskId=await fixtureQueue.enqueue({scope,role:agentRole,credential:'manager',workflowId:workflow.id,workflowStep:step});
  const claimed=await fixtureQueue.claim({scope,role:agentRole,credential,expectedTaskId:taskId});
  assert.equal(claimed.id,taskId);
  await q.finish({scope,role:agentRole,credential,taskId,leaseId:claimed.lease_id,outcome:'succeeded',evidenceSha256:'d'.repeat(64)});
  const advanced=await ledger(pools[1]).advance({credential:'manager',id:workflow.id,step,taskId});
  assert.equal(advanced.next_step,step+1);
  await assert.rejects(ledger(pools[0]).advance({credential:'manager',id:workflow.id,step,taskId}),/Handoff denied/);
 }
 assert.equal((await ledger(pools[0]).status({credential:'manager',id:workflow.id})).next_step,8);
 await assert.rejects(ledger(pools[1]).status({credential:'w1',id:workflow.id}),/Workflow identity denied/);
 const persistent=await ledger(pools[0]).create('manager');
 for(const [step,agentRole] of sequence.entries()){
  const prior=await ledger(pools[1]).readFixturePrior({credential:'manager',id:persistent.id});
  assert.equal(prior.length,step);
  const adapters=Object.fromEntries(sequence.map(r=>[r,async ctx=>{
   assert.equal(ctx.role.id,agentRole);
   assert.deepEqual(ctx.prior.map(p=>p.role),sequence.slice(0,step));
   return Object.fromEntries(contract(r).fields.map(field=>[field,['fixture '+r+' '+field]]));
  }]));
  const manager=createAgentManager({scopes:[scope],adapters,fixturePriorEnabled:true});
  const taskId=await fixtureQueue.enqueue({scope,role:agentRole,credential:'manager',workflowId:persistent.id,workflowStep:step});
  const worker=createQueueWorker({queue:fixtureQueue,manager,fixtureProposalStorage:true,loadTask:async ({id})=>({id,...scope,subject:'Disposable workflow fixture',fixturePrior:prior})});
  const completed=await worker.runOnce({scope,role:agentRole,credential:'worker-'+step,expectedTaskId:taskId});
  assert.equal(completed.state,'succeeded');
  assert.equal(completed.taskId,taskId);
  await ledger(pools[1]).advance({credential:'manager',id:persistent.id,step,taskId});
 }
 const prior=await ledger(pools[1]).readFixturePrior({credential:'manager',id:persistent.id});
 assert.deepEqual(prior.map(p=>p.role),sequence);
 await assert.rejects(ledger(pools[1]).readFixturePrior({credential:'w1',id:persistent.id}),/Workflow identity denied/);
 // Durable proposal bodies must remain cryptographically bound to their receipt digests.
 await pools[0].query("UPDATE engineering_team_fixture_proposals SET body=body || 'tampered' WHERE task_id=(SELECT task_id FROM engineering_team_handoffs WHERE workflow_id=$1 AND step=3)",[persistent.id]);
 await assert.rejects(ledger(pools[1]).readFixturePrior({credential:'manager',id:persistent.id}),/Prior evidence denied/);
 const boundWorkflow=await ledger(pools[0]).create('manager');
 const unrelatedWorkflow=await ledger(pools[1]).create('manager');
 const boundRole=sequence[0],boundCredential='worker-0';
 const unboundTask=await q.enqueue({scope,role:boundRole,credential:'manager'});
 const unboundLease=await q.claim({scope,role:boundRole,credential:boundCredential});
 await q.finish({scope,role:boundRole,credential:boundCredential,taskId:unboundTask,leaseId:unboundLease.lease_id,outcome:'succeeded',evidenceSha256:'b'.repeat(64)});
 await assert.rejects(ledger(pools[1]).advance({credential:'manager',id:unrelatedWorkflow.id,step:0,taskId:unboundTask}),/Handoff denied/);
 await assert.rejects(fixtureQueue.enqueue({scope,role:'devops',credential:'manager',workflowId:boundWorkflow.id,workflowStep:0}),/Workflow enqueue denied/);
 const boundTask=await fixtureQueue.enqueue({scope,role:boundRole,credential:'manager',workflowId:boundWorkflow.id,workflowStep:0});
 await assert.rejects(fixtureQueue.enqueue({scope,role:boundRole,credential:'manager',workflowId:boundWorkflow.id,workflowStep:0}));
 assert.equal(await q2.claim({scope,role:boundRole,credential:boundCredential}),null);
 const boundLease=await fixtureQueue.claim({scope,role:boundRole,credential:boundCredential,expectedTaskId:boundTask});
 assert.equal(boundLease.id,boundTask);
 await fixtureQueue.finish({scope,role:boundRole,credential:boundCredential,taskId:boundTask,leaseId:boundLease.lease_id,outcome:'succeeded',evidenceSha256:'a'.repeat(64)});
 await assert.rejects(ledger(pools[1]).advance({credential:'manager',id:unrelatedWorkflow.id,step:0,taskId:boundTask}),/Handoff denied/);
 assert.equal((await ledger(pools[1]).advance({credential:'manager',id:boundWorkflow.id,step:0,taskId:boundTask})).next_step,1);
 const runtimeCalls=[];
 const runtimeFiles=[{path:'src/example.js',role:'backend-developer',text:'module.exports=1;'}];
 const runtimeAdapters=Object.fromEntries(sequence.map((r,i)=>[r,async ctx=>{
  assert.deepEqual(ctx.prior.map(p=>p.role),sequence.slice(0,i));
  runtimeCalls.push(r);
  return Object.fromEntries(contract(r).fields.map(field=>[field,['fixture '+r+' '+field]]));
 }]));
 const runtimePreparation=createChangePreparation({scope,files:runtimeFiles,requiredChecks:['fixture'],authorize:async()=>true,
 generate:async()=>JSON.stringify({edits:[{path:runtimeFiles[0].path,beforeSha256:digest(runtimeFiles[0].text),replacement:'module.exports=2;'}]}),
 runIsolated:async x=>({evidenceSha256:x.plan.evidenceSha256,profile:x.profile,checks:[{name:'fixture',status:'passed'}]}),
 reviewPatch:async x=>({role:'security-reviewer',disposition:'recommend-review',evidenceSha256:x.plan.evidenceSha256})});
 const runtime=createFixtureRuntime({scope,queue:fixtureQueue,ledger:ledger(pools[1]),adapters:runtimeAdapters,preparation:runtimePreparation,authorize:async()=>true});
 const runtimeInput={subject:'Disposable runtime fixture',developerRole:'backend-developer',managerCredential:'manager',workerCredentials:Object.fromEntries(sequence.map((r,i)=>[r,'worker-'+i]))};
 const runtimeResult=await runtime.run(runtimeInput);
 assert.deepEqual(runtimeCalls,sequence);
 assert.equal(runtimeResult.change.request.patchDigest,runtimeResult.change.plan.evidenceSha256);
 assert.equal(runtimeResult.executionAuthorized,false);
 assert.equal(runtimeResult.releaseApproved,false);
 assert.equal((await ledger(pools[0]).status({credential:'manager',id:runtimeResult.workflowId})).next_step,8);
 let replayedPreparationCalls=0;
 const restartPreparation={prepare:async()=>{replayedPreparationCalls++;throw Error('completed preparation must not replay');}};
 const restartResult=await createFixtureRuntime({scope,queue:fixtureQueue,ledger:ledger(pools[1]),adapters:runtimeAdapters,preparation:restartPreparation,authorize:async()=>true}).resume({workflowId:runtimeResult.workflowId,managerCredential:'manager',workerCredentials:runtimeInput.workerCredentials});
 assert.equal(restartResult.state,'completed');
 assert.equal(replayedPreparationCalls,0);
 assert.equal(restartResult.changeEvidenceSha256,runtimeResult.changeEvidenceSha256);
 await assert.rejects(runtime.run(runtimeInput),/Fixture runtime denied/);
 // A role-level policy closure pauses at the exact next step; reopening policy resumes
 // from durable handoffs without replaying the already completed roles.
 const pausedWorkflow=await ledger(pools[0]).create('manager',{subject:'Policy pause/resume fixture',developerRole:'backend-developer'});
 const pausedRuntime=createFixtureRuntime({scope,queue:fixtureQueue,ledger:ledger(pools[1]),adapters:runtimeAdapters,preparation:runtimePreparation,authorize:async request=>!(request.action==='role.simulate'&&request.role===sequence[3])});
 const paused=await pausedRuntime.resume({workflowId:pausedWorkflow.id,managerCredential:'manager',workerCredentials:runtimeInput.workerCredentials});
 assert.equal(paused.state,'denied');
 assert.equal((await ledger(pools[0]).status({credential:'manager',id:pausedWorkflow.id})).next_step,3);
 const resumedRoles=[];
 const resumedAdapters=Object.fromEntries(sequence.map(r=>[r,async ctx=>{
  assert.deepEqual(ctx.prior.map(p=>p.role),sequence.slice(0,3+resumedRoles.length));
  resumedRoles.push(r);
  return Object.fromEntries(contract(r).fields.map(field=>[field,['resumed '+r+' '+field]]));
 }]));
 const resumedPreparation=createChangePreparation({scope,files:runtimeFiles,requiredChecks:['fixture'],authorize:async()=>true,
 generate:async()=>JSON.stringify({edits:[{path:runtimeFiles[0].path,beforeSha256:digest(runtimeFiles[0].text),replacement:'module.exports=2;'}]}),
 runIsolated:async x=>({evidenceSha256:x.plan.evidenceSha256,profile:x.profile,checks:[{name:'fixture',status:'passed'}]}),
 reviewPatch:async x=>({role:'security-reviewer',disposition:'recommend-review',evidenceSha256:x.plan.evidenceSha256})});
 const policyResumed=await createFixtureRuntime({scope,queue:fixtureQueue,ledger:ledger(pools[1]),adapters:resumedAdapters,preparation:resumedPreparation,authorize:async()=>true}).resume({workflowId:pausedWorkflow.id,managerCredential:'manager',workerCredentials:runtimeInput.workerCredentials});
 assert.equal(policyResumed.state,'completed');
 assert.deepEqual(resumedRoles,sequence.slice(3));
 assert.equal((await ledger(pools[0]).status({credential:'manager',id:pausedWorkflow.id})).next_step,8);
 // Restart recovery: task succeeded durably, but process stopped before ledger advance.
 const recoveryWorkflow=await ledger(pools[0]).create('manager',{subject:'Restart recovery fixture',developerRole:'backend-developer'});
 const recoveryTask=await fixtureQueue.enqueue({scope,role:sequence[0],credential:'manager',workflowId:recoveryWorkflow.id,workflowStep:0});
 const recoveryPrior=await ledger(pools[1]).readFixturePrior({credential:'manager',id:recoveryWorkflow.id});
 const recoveryAdapters=Object.fromEntries(sequence.map(r=>[r,async ctx=>{assert.equal(ctx.task.subject,'Restart recovery fixture');return Object.fromEntries(contract(r).fields.map(field=>[field,['recovery '+r]]));}]));
 const recoveryManager=createAgentManager({scopes:[scope],adapters:recoveryAdapters,fixturePriorEnabled:true});
 const recoveryWorker=createQueueWorker({queue:fixtureQueue,manager:recoveryManager,fixtureProposalStorage:true,loadTask:async({id})=>({id,...scope,subject:'Restart recovery fixture',fixturePrior:recoveryPrior})});
 assert.equal((await recoveryWorker.runOnce({scope,role:sequence[0],credential:'worker-0',expectedTaskId:recoveryTask})).state,'succeeded');
 const recoveryPreparation=createChangePreparation({scope,files:runtimeFiles,requiredChecks:['fixture'],authorize:async()=>true,
 generate:async()=>JSON.stringify({edits:[{path:runtimeFiles[0].path,beforeSha256:digest(runtimeFiles[0].text),replacement:'module.exports=2;'}]}),
 runIsolated:async x=>({evidenceSha256:x.plan.evidenceSha256,profile:x.profile,checks:[{name:'fixture',status:'passed'}]}),
 reviewPatch:async x=>({role:'security-reviewer',disposition:'recommend-review',evidenceSha256:x.plan.evidenceSha256})});
 const resumedRuntime=createFixtureRuntime({scope,queue:fixtureQueue,ledger:ledger(pools[1]),adapters:recoveryAdapters,preparation:recoveryPreparation,authorize:async()=>true});
 const resumed=await resumedRuntime.resume({workflowId:recoveryWorkflow.id,subject:'ATTACKER-SUBSTITUTED SUBJECT',developerRole:'backend-developer',managerCredential:'manager',workerCredentials:Object.fromEntries(sequence.map((r,i)=>[r,'worker-'+i]))});
 assert.equal(resumed.state,'completed');
 assert.equal((await ledger(pools[0]).status({credential:'manager',id:recoveryWorkflow.id})).next_step,8);
 assert.deepEqual(await ledger(pools[0]).readInput({credential:'manager',id:recoveryWorkflow.id}),{subject:'Restart recovery fixture',developerRole:'backend-developer'});
 await assert.rejects(ledger(pools[0]).readInput({credential:'w1',id:recoveryWorkflow.id}),/Workflow identity denied/);
 // Unknown in-flight work is surfaced for reconciliation and never reclaimed automatically.
 const unknownWorkflow=await ledger(pools[0]).create('manager',{subject:'Unknown lease fixture',developerRole:'backend-developer'});
 const unknownTask=await fixtureQueue.enqueue({scope,role:sequence[0],credential:'manager',workflowId:unknownWorkflow.id,workflowStep:0});
 const unknownLease=await fixtureQueue.claim({scope,role:sequence[0],credential:'worker-0',expectedTaskId:unknownTask});
 assert.equal(unknownLease.id,unknownTask);
 const unknownResume=await createFixtureRuntime({scope,queue:fixtureQueue,ledger:ledger(pools[1]),adapters:recoveryAdapters,preparation:runtimePreparation,authorize:async()=>true}).resume({workflowId:unknownWorkflow.id,subject:'Unknown lease fixture',developerRole:'backend-developer',managerCredential:'manager',workerCredentials:Object.fromEntries(sequence.map((r,i)=>[r,'worker-'+i]))});
 assert.equal(unknownResume.state,'needs-reconciliation');
 assert.equal(unknownResume.taskId,unknownTask);
 assert.equal((await fixtureQueue.inspectWorkflowStep({scope,workflowId:unknownWorkflow.id,workflowStep:0,credential:'manager'})).state,'running');
 function fixturePublicationRequest(scope,seed){
  const payload={scope,operation:'github.write',mode:'draft-only',patchDigest:seed.repeat(64),testDigest:'1'.repeat(64),reviewDigest:'2'.repeat(64)};
  return {...payload,evidenceSha256:digest(JSON.stringify(payload)),executionAuthorized:false,requiresIndependentAcceptance:true};
 }
 const publicationRequest=fixturePublicationRequest(scope,'e');
 const publicationDetails={request:publicationRequest,evidenceSha256:publicationRequest.evidenceSha256,baseBranch:'main',headBranch:'aca-agent-draft-'+'1'.repeat(16),headSha:'c'.repeat(40)};
 const publicationBinding=computePublicationBinding({...publicationDetails,repository:scope.repository});
 const pub=await approval(pools[0]).request({scope,operation:'github.write',evidence:publicationBinding,credential:'manager'});
 const reserve=pool=>createPublicationReservation({pool,scope,authenticate:async c=>identities.get(c)});
 const reservation={credential:'manager',approvalId:pub.id,binding:publicationBinding,...publicationDetails};
 await assert.rejects(reserve(pools[0]).reserve(reservation),/Reservation denied/);
 await approval(pools[1]).recordDecision({scope,id:pub.id,binding:pub.binding,decision:'approved',credential:'owner'});
 await assert.rejects(reserve(pools[1]).reserve({...reservation,binding:'f'.repeat(64)}),/Reservation denied/);
 await assert.rejects(reserve(pools[1]).reserve({...reservation,credential:'w1'}),/Reservation denied/);
 await assert.rejects(createPublicationReservation({pool:pools[1],scope,authenticate:async()=>({...scope,id:'publication-other-manager',permission:'queue.manage'})}).reserve(reservation),/Reservation denied/);
 const attempts=await Promise.allSettled(pools.map(pool=>reserve(pool).reserve(reservation)));
 assert.equal(attempts.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(attempts.find(x=>x.status==='fulfilled').value.executionAuthorized,false);
 assert.deepEqual((await pools[0].query('SELECT reserved_by FROM engineering_team_publication_attempts WHERE binding=$1',[publicationBinding])).rows,[{reserved_by:'manager'}]);
 await assert.rejects(reserve(pools[1]).reserve(reservation),/Reservation denied/);
 const providerBudgetId=randomUUID();
 const providerManifest=createActivationManifest({scope,models:Object.fromEntries(sequence.map(r=>[r,'fixture'])),budgetId:providerBudgetId,paths:['src/example.js'],issue:42,runnerImage:'node@sha256:'+'a'.repeat(64),limits:{maxCalls:8,maxOutputTokens:256,maxSpendMicrousd:1000}});
 let policyOpen=true;
 const providerPolicy=createQueuePolicyBridge({manifest:providerManifest,readQueueState:async()=>({repository:scope.repository,headSha:scope.sha,issue:{number:42,state:policyOpen?'open':'closed',isPullRequest:false,labels:['aca:auto/docs-test'],assignees:[]},activeIssueNumbers:[]})});
 const provider=pool=>createProviderReservation({pool,manifest:providerManifest,policy:providerPolicy,authenticate:async c=>identities.get(c),ceilings:{fixture:400}});
 await pools[0].query('INSERT INTO engineering_team_spend_budgets(product,repository,budget_id,max_calls,max_microusd) VALUES ($1,$2,$3,8,900)',[scope.product,scope.repository,providerBudgetId]);
 const providerBinding=await provider(pools[0]).evidence();
 const providerApproval=await approval(pools[0]).request({scope,operation:'provider.activate',evidence:providerBinding,credential:'manager'});
 const providerInput={credential:'manager',approvalId:providerApproval.id};
 await assert.rejects(provider(pools[1]).reserve(providerInput),/Reservation denied/);
 await approval(pools[1]).recordDecision({scope,id:providerApproval.id,binding:providerApproval.binding,decision:'approved',credential:'owner'});
 await assert.rejects(provider(pools[1]).reserve({...providerInput,credential:'w1'}),/Reservation denied/);
 policyOpen=false;
 await assert.rejects(provider(pools[1]).reserve(providerInput),/Policy denied/);
 policyOpen=true;
 await assert.rejects(provider(pools[1]).reserve(providerInput),/Spend budget denied/);
 assert.equal((await pools[0].query('SELECT binding FROM engineering_team_provider_attempts WHERE binding=$1',[providerBinding])).rowCount,0);
 await pools[0].query('UPDATE engineering_team_spend_budgets SET max_microusd=1000 WHERE budget_id=$1',[providerBudgetId]);
 // Expired approval must fail even when budget and current issue policy are valid.
 await pools[0].query("UPDATE engineering_team_approval_requests SET created_at=clock_timestamp()-interval '2 minutes',expires_at=clock_timestamp()-interval '1 minute' WHERE id=$1",[providerApproval.id]);
 await assert.rejects(provider(pools[1]).reserve(providerInput),/Reservation denied/);
 assert.equal((await pools[1].query('SELECT binding FROM engineering_team_provider_attempts WHERE binding=$1',[providerBinding])).rowCount,0);
 assert.deepEqual((await pools[1].query('SELECT reserved_calls,reserved_microusd FROM engineering_team_spend_budgets WHERE budget_id=$1',[providerBudgetId])).rows[0],{reserved_calls:0,reserved_microusd:'0'});
 // Restore only the disposable approval fixture for the existing concurrency test.
 await pools[0].query("UPDATE engineering_team_approval_requests SET expires_at=clock_timestamp()+interval '5 minutes' WHERE id=$1",[providerApproval.id]);
 // A different authenticated manager with the identical scope cannot consume this approval.
 identities.set('other-manager',{...scope,id:'other-manager',permission:'queue.manage'});
 await assert.rejects(provider(pools[1]).reserve({...providerInput,credential:'other-manager'}),/Reservation denied/);
 assert.equal((await pools[0].query('SELECT binding FROM engineering_team_provider_attempts WHERE binding=$1',[providerBinding])).rowCount,0);
 assert.deepEqual((await pools[1].query('SELECT reserved_calls,reserved_microusd FROM engineering_team_spend_budgets WHERE budget_id=$1',[providerBudgetId])).rows[0],{reserved_calls:0,reserved_microusd:'0'});
 identities.delete('other-manager');
 let providerIdentityChecks=0;
 const revokedProvider=createProviderReservation({pool:pools[1],manifest:providerManifest,policy:providerPolicy,authenticate:async c=>++providerIdentityChecks===1?identities.get(c):null,ceilings:{fixture:400}});
 await assert.rejects(revokedProvider.reserve(providerInput),/Reservation denied/);
 assert.equal(providerIdentityChecks,2);
 assert.equal((await pools[0].query('SELECT binding FROM engineering_team_provider_attempts WHERE binding=$1',[providerBinding])).rowCount,0);
 assert.deepEqual((await pools[0].query('SELECT reserved_calls,reserved_microusd FROM engineering_team_spend_budgets WHERE budget_id=$1',[providerBudgetId])).rows[0],{reserved_calls:0,reserved_microusd:'0'});

 const providerResults=await Promise.allSettled(pools.map(pool=>provider(pool).reserve(providerInput)));
 assert.equal(providerResults.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(providerResults.find(x=>x.status==='fulfilled').value.executionAuthorized,false);
 assert.deepEqual((await pools[1].query('SELECT reserved_by FROM engineering_team_provider_attempts WHERE binding=$1',[providerBinding])).rows,[{reserved_by:'manager'}]);
 assert.deepEqual((await pools[0].query('SELECT reserved_calls,reserved_microusd FROM engineering_team_spend_budgets WHERE budget_id=$1',[providerBudgetId])).rows[0],{reserved_calls:1,reserved_microusd:'400'});
 await assert.rejects(provider(pools[1]).reserve(providerInput),/Reservation denied/);

 // Review-bound reservation uses disposable keys and the same transactional budget.
 const {generateKeyPairSync,sign}=require('node:crypto');
 const {createActivationReviewVerifier}=require('../src/automation/engineeringTeam/activationReviewVerifier');
 const keys=generateKeyPairSync('ed25519');
 let revoked=false;
 const reviewVerifier=createActivationReviewVerifier({manifest:providerManifest,publicKey:keys.publicKey,reviewerId:'independent',authorIds:['author'],isRevoked:async()=>revoked});
 const reviewed=pool=>createProviderReservation({pool,manifest:providerManifest,policy:providerPolicy,authenticate:async c=>identities.get(c),ceilings:{fixture:400},reviewVerifier});
 const now=Math.floor(Date.now()/1000);
 const envelope=(overrides={})=>{
  const record={manifestDigest:providerManifest.evidenceSha256,reviewerId:'independent',status:'passed',findings:0,issuedAt:now,expiresAt:now+600,...overrides};
  const payload=JSON.stringify(['aca-engineering-activation-review-v1',record.manifestDigest,record.reviewerId,record.status,record.findings,record.issuedAt,record.expiresAt]);
  return {record,signature:sign(null,Buffer.from(payload),keys.privateKey).toString('hex')};
 };
 const reviewEnvelope=envelope();
 await assert.rejects(reviewed(pools[0]).evidence(),/Independent review denied/);
 await assert.rejects(reviewed(pools[0]).evidence(envelope({manifestDigest:'f'.repeat(64)})),/Independent review denied/);
 await assert.rejects(reviewed(pools[0]).evidence(envelope({issuedAt:now-100,expiresAt:now-1})),/Independent review denied/);
 await assert.rejects(reviewed(pools[0]).evidence({...reviewEnvelope,signature:'0'.repeat(128)}),/Independent review denied/);
 const reviewBinding=await reviewed(pools[0]).evidence(reviewEnvelope);
 assert.notEqual(reviewBinding,providerBinding);
 const reviewApproval=await approval(pools[0]).request({scope,operation:'provider.activate',evidence:reviewBinding,credential:'manager'});
 const reviewInput={credential:'manager',approvalId:reviewApproval.id,reviewEnvelope};
 await assert.rejects(reviewed(pools[0]).reserve(reviewInput),/Reservation denied/);
 await approval(pools[1]).recordDecision({scope,id:reviewApproval.id,binding:reviewApproval.binding,decision:'approved',credential:'owner'});
 revoked=true;
 await assert.rejects(reviewed(pools[1]).reserve(reviewInput),/Independent review denied/);
 revoked=false;
 await assert.rejects(reviewed(pools[1]).reserve({...reviewInput,reviewEnvelope:envelope({expiresAt:now+500})}),/Reservation denied/);
 await assert.rejects(reviewed(pools[1]).reserve(reviewInput),/unresolved provider attempt/);
 const {createProviderOutcome}=require('../src/automation/engineeringTeam/providerOutcome');
 const outcomes=pools.map(pool=>createProviderOutcome({pool,scope,authenticate:async c=>identities.get(c)}));
 const usage={inputTokens:10,outputTokens:5,actualMicrousd:100};
 await assert.rejects(outcomes[0].record({credential:'w1',binding:providerBinding,usage}),/Outcome denied/);
 await assert.rejects(outcomes[0].record({credential:'owner',binding:'f'.repeat(64),usage}),/Outcome denied/);
 await assert.rejects(outcomes[0].record({credential:'manager',binding:providerBinding,usage}),/Outcome denied/);
 const otherScope={...scope,sha:'f'.repeat(40)};
 const otherOutcome=createProviderOutcome({pool:pools[0],scope:otherScope,authenticate:async()=>({...identities.get('owner'),sha:otherScope.sha})});
 await assert.rejects(otherOutcome.record({credential:'owner',binding:providerBinding,usage}),/Outcome denied/);
 const recorded=await Promise.allSettled(outcomes.map(o=>o.record({credential:'owner',binding:providerBinding,usage})));
 assert.equal(recorded.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(recorded.find(x=>x.status==='fulfilled').value.outcome,'completed');
 // Distinct approved requests are admitted only up to each independent durable budget ceiling.
 async function runProviderBudgetCap({tag,maxCalls,maxMicrousd}){
  const budgetId=randomUUID();
  const raceManifest=createActivationManifest({...providerManifest,budgetId,limits:{...providerManifest.limits,maxCalls,maxSpendMicrousd:maxMicrousd}});
  const racePolicy=createQueuePolicyBridge({manifest:raceManifest,readQueueState:async()=>({repository:scope.repository,headSha:scope.sha,issue:{number:42,state:'open',isPullRequest:false,labels:['aca:auto/docs-test'],assignees:[]},activeIssueNumbers:[]})});
  const raceProvider=pool=>createProviderReservation({pool,manifest:raceManifest,policy:racePolicy,authenticate:async c=>identities.get(c),ceilings:{fixture:400},prepareRequest:request=>({model:'fixture',executionAuthorized:false,evidenceSha256:digest(JSON.stringify([tag,request]))})});
  await pools[0].query('INSERT INTO engineering_team_spend_budgets(product,repository,budget_id,max_calls,max_microusd) VALUES ($1,$2,$3,$4,$5)',[scope.product,scope.repository,budgetId,maxCalls,maxMicrousd]);
  const allowedCalls=Math.min(maxCalls,Math.floor(maxMicrousd/400));
  const requests=await Promise.all(Array.from({length:allowedCalls+1},async(_,i)=>{
   const request={label:tag+'-'+i};
   const binding=await raceProvider(pools[0]).evidence(undefined,request);
   const approvalRequest=await approval(pools[0]).request({scope,operation:'provider.activate',evidence:binding,credential:'manager'});
   await approval(pools[1]).recordDecision({scope,id:approvalRequest.id,binding:approvalRequest.binding,decision:'approved',credential:'owner'});
   return {request,binding,approvalId:approvalRequest.id};
  }));
  const {createProviderOutcome}=require('../src/automation/engineeringTeam/providerOutcome');
  const outcome=createProviderOutcome({pool:pools[1],scope,authenticate:async c=>identities.get(c)});
  for(let i=0;i<allowedCalls;i++){
   await raceProvider(pools[i%2]).reserve({credential:'manager',approvalId:requests[i].approvalId,request:requests[i].request});
   await outcome.record({credential:'owner',binding:requests[i].binding,usage:{inputTokens:1,outputTokens:1,actualMicrousd:1}});
  }
  await assert.rejects(raceProvider(pools[1]).reserve({credential:'manager',approvalId:requests[allowedCalls].approvalId,request:requests[allowedCalls].request}),/Spend budget denied/);
  const stored=await pools[1].query('SELECT reserved_calls,reserved_microusd FROM engineering_team_spend_budgets WHERE budget_id=$1',[budgetId]);
  assert.deepEqual(stored.rows[0],{reserved_calls:allowedCalls,reserved_microusd:String(allowedCalls*400)});
  assert.equal((await pools[1].query('SELECT count(*)::int AS n FROM engineering_team_provider_attempts WHERE budget_id=$1',[budgetId])).rows[0].n,allowedCalls);
 }
 await runProviderBudgetCap({tag:'call-cap',maxCalls:8,maxMicrousd:4000});
 await runProviderBudgetCap({tag:'spend-cap',maxCalls:8,maxMicrousd:400});


 assert.deepEqual((await pools[0].query('SELECT reserved_calls,reserved_microusd FROM engineering_team_spend_budgets WHERE budget_id=$1',[providerBudgetId])).rows[0],{reserved_calls:1,reserved_microusd:'400'});
 const reviewResults=await Promise.allSettled(pools.map(pool=>reviewed(pool).reserve(reviewInput)));
 assert.equal(reviewResults.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(reviewResults.find(x=>x.status==='fulfilled').value.executionAuthorized,false);
 assert.deepEqual((await pools[0].query('SELECT reserved_calls,reserved_microusd FROM engineering_team_spend_budgets WHERE budget_id=$1',[providerBudgetId])).rows[0],{reserved_calls:2,reserved_microusd:'800'});
 // Reconcile the second attempt before testing the remaining budget ceiling.
 assert.equal((await outcomes[0].record({credential:'owner',binding:reviewBinding,usage})).outcome,'completed');
 const excessEnvelope=envelope({expiresAt:now+400});
 const excessBinding=await reviewed(pools[0]).evidence(excessEnvelope);
 const excessApproval=await approval(pools[0]).request({scope,operation:'provider.activate',evidence:excessBinding,credential:'manager'});
 await approval(pools[1]).recordDecision({scope,id:excessApproval.id,binding:excessApproval.binding,decision:'approved',credential:'owner'});
 await assert.rejects(reviewed(pools[1]).reserve({credential:'manager',approvalId:excessApproval.id,reviewEnvelope:excessEnvelope}),/Spend budget denied/);
 assert.equal((await pools[0].query('SELECT binding FROM engineering_team_provider_attempts WHERE binding=$1',[excessBinding])).rowCount,0);
 const requestBound=createProviderReservation({pool:pools[0],manifest:providerManifest,policy:providerPolicy,authenticate:async c=>identities.get(c),ceilings:{fixture:400},reviewVerifier,prepareRequest:request=>({model:'fixture',executionAuthorized:false,evidenceSha256:digest(JSON.stringify(request))})});
 const exactRequest={input:'fixture'};
 const exactBinding=await requestBound.evidence(reviewEnvelope,exactRequest);
 assert.notEqual(exactBinding,await requestBound.evidence(reviewEnvelope,{input:'substitution'}));
 const exactApproval=await approval(pools[0]).request({scope,operation:'provider.activate',evidence:exactBinding,credential:'manager'});
 await approval(pools[1]).recordDecision({scope,id:exactApproval.id,binding:exactApproval.binding,decision:'approved',credential:'owner'});
 await assert.rejects(requestBound.reserve({credential:'manager',approvalId:exactApproval.id,reviewEnvelope,request:{input:'substitution'}}),/Reservation denied/);
 assert.equal((await pools[0].query('SELECT binding FROM engineering_team_provider_attempts WHERE binding=$1',[exactBinding])).rowCount,0);
 // Caller mutation during asynchronous authentication must not substitute approved evidence.
 const mutableRequest={input:'substitution'};
 const mutationBound=createProviderReservation({pool:pools[0],manifest:providerManifest,policy:providerPolicy,authenticate:async c=>{mutableRequest.input='fixture';return identities.get(c);},ceilings:{fixture:400},reviewVerifier,prepareRequest:request=>({model:'fixture',executionAuthorized:false,evidenceSha256:digest(JSON.stringify(request))})});
 await assert.rejects(mutationBound.reserve({credential:'manager',approvalId:exactApproval.id,reviewEnvelope,request:mutableRequest}),/Reservation denied/);
 assert.equal((await pools[0].query('SELECT binding FROM engineering_team_provider_attempts WHERE binding=$1',[exactBinding])).rowCount,0);
 const unknownBudgetId=randomUUID();
 const unknownManifest=createActivationManifest({...providerManifest,budgetId:unknownBudgetId});
 const unknownPolicy=createQueuePolicyBridge({manifest:unknownManifest,readQueueState:async()=>({repository:scope.repository,headSha:scope.sha,issue:{number:42,state:'open',isPullRequest:false,labels:['aca:auto/docs-test'],assignees:[]},activeIssueNumbers:[]})});
 const {createCostEnvelope}=require('../src/automation/engineeringTeam/costEnvelope');
 const costEnvelope=createCostEnvelope({manifest:unknownManifest,maxInputTokens:100,prices:{fixture:{input:100000,output:200000}}});
 const unknownProvider=createProviderReservation({pool:pools[0],manifest:unknownManifest,policy:unknownPolicy,authenticate:async c=>identities.get(c),ceilings:costEnvelope.ceilings,costEvidenceSha256:costEnvelope.evidenceSha256});
 await pools[0].query('INSERT INTO engineering_team_spend_budgets(product,repository,budget_id,max_calls,max_microusd) VALUES ($1,$2,$3,8,1000)',[scope.product,scope.repository,unknownBudgetId]);
 const unknownBinding=await unknownProvider.evidence();
 const unknownApproval=await approval(pools[0]).request({scope,operation:'provider.activate',evidence:unknownBinding,credential:'manager'});
 await approval(pools[1]).recordDecision({scope,id:unknownApproval.id,binding:unknownApproval.binding,decision:'approved',credential:'owner'});
 await unknownProvider.reserve({credential:'manager',approvalId:unknownApproval.id});
 // Exercise the complete reservation path for the breach fixture.
 const breachBudgetId=randomUUID();
 const breachManifest=createActivationManifest({...providerManifest,budgetId:breachBudgetId});
 const breachPolicy=createQueuePolicyBridge({manifest:breachManifest,readQueueState:async()=>({repository:scope.repository,headSha:scope.sha,issue:{number:42,state:'open',isPullRequest:false,labels:['aca:auto/docs-test'],assignees:[]},activeIssueNumbers:[]})});
 const breachCost=createCostEnvelope({manifest:breachManifest,maxInputTokens:100,prices:{fixture:{input:100000,output:200000}}});
 const breachProvider=createProviderReservation({pool:pools[0],manifest:breachManifest,policy:breachPolicy,authenticate:async c=>identities.get(c),ceilings:breachCost.ceilings,costEvidenceSha256:breachCost.evidenceSha256});
 await pools[0].query('INSERT INTO engineering_team_spend_budgets(product,repository,budget_id,max_calls,max_microusd) VALUES ($1,$2,$3,8,1000)',[scope.product,scope.repository,breachBudgetId]);
 const breachBinding=await breachProvider.evidence();
 const breachApproval=await approval(pools[0]).request({scope,operation:'provider.activate',evidence:breachBinding,credential:'manager'});
 await approval(pools[1]).recordDecision({scope,id:breachApproval.id,binding:breachApproval.binding,decision:'approved',credential:'owner'});
 await assert.rejects(breachProvider.reserve({credential:'manager',approvalId:breachApproval.id}),/unresolved provider attempt/);
 // Reconcile the first fixture before admitting another attempt.

 const assessedOutcomes=pools.map(pool=>createProviderOutcome({pool,scope,authenticate:async c=>identities.get(c),costEnvelope}));
 const changedCost=createProviderOutcome({pool:pools[1],scope,authenticate:async c=>identities.get(c),costEnvelope:createCostEnvelope({manifest:unknownManifest,maxInputTokens:99,prices:{fixture:{input:100000,output:200000}}})});
 await assert.rejects(changedCost.record({credential:'owner',binding:unknownBinding,usage}),/Outcome cost evidence denied/);
 await assert.rejects(outcomes[0].record({credential:'owner',binding:unknownBinding,usage}),/Outcome cost evidence denied/);
 await assessedOutcomes[0].record({credential:'owner',binding:unknownBinding,usage:{inputTokens:10,outputTokens:5,actualMicrousd:999}});
 assert.equal(Number((await pools[1].query('SELECT actual_microusd FROM engineering_team_provider_outcomes WHERE binding=$1',[unknownBinding])).rows[0].actual_microusd),2);
 await breachProvider.reserve({credential:'manager',approvalId:breachApproval.id});
 const stopQuery='SELECT 1 FROM engineering_team_stops WHERE product=$1 AND repository=$2';
 const stopArgs=[scope.product,scope.repository];
 assert.equal((await pools[0].query(stopQuery,stopArgs)).rowCount,0);
 const costBound=createProviderOutcome({pool:pools[0],scope,authenticate:async c=>identities.get(c),costEnvelope:createCostEnvelope({manifest:breachManifest,maxInputTokens:100,prices:{fixture:{input:100000,output:200000}}})});
 const wrongBudget=createProviderOutcome({pool:pools[1],scope,authenticate:async c=>identities.get(c),costEnvelope:createCostEnvelope({manifest:unknownManifest,maxInputTokens:100,prices:{fixture:{input:100000,output:200000}}})});
 await assert.rejects(wrongBudget.record({credential:'owner',binding:breachBinding,usage:{inputTokens:101,outputTokens:0}}),/Outcome budget denied/);
 const breach=await costBound.record({credential:'owner',binding:breachBinding,usage:{inputTokens:101,outputTokens:0,actualMicrousd:0}});
 assert.equal((await pools[0].query('SELECT actual_microusd FROM engineering_team_provider_outcomes WHERE binding=$1',[breachBinding])).rows[0].actual_microusd,'11');
 assert.deepEqual(breach,{outcome:'breach',executionAuthorized:false});
 assert.equal((await pools[1].query(stopQuery,stopArgs)).rowCount,1);
 assert.deepEqual((await pools[1].query('SELECT reserved_calls,reserved_microusd FROM engineering_team_spend_budgets WHERE budget_id=$1',[breachBudgetId])).rows[0],{reserved_calls:1,reserved_microusd:String(breachCost.ceilings.fixture)});
 // Reset only the disposable test fixture to isolate the unknown-outcome assertion.
 await pools[0].query('DELETE FROM engineering_team_stops WHERE product=$1 AND repository=$2',stopArgs);
 assert.equal((await pools[1].query(stopQuery,stopArgs)).rowCount,0);
 const finalUnknownBudgetId=randomUUID();
 const finalUnknownManifest=createActivationManifest({...providerManifest,budgetId:finalUnknownBudgetId});
 const finalUnknownPolicy=createQueuePolicyBridge({manifest:finalUnknownManifest,readQueueState:async()=>({repository:scope.repository,headSha:scope.sha,issue:{number:42,state:'open',isPullRequest:false,labels:['aca:auto/docs-test'],assignees:[]},activeIssueNumbers:[]})});
 const finalUnknownProvider=createProviderReservation({pool:pools[0],manifest:finalUnknownManifest,policy:finalUnknownPolicy,authenticate:async c=>identities.get(c),ceilings:{fixture:400}});
 await pools[0].query('INSERT INTO engineering_team_spend_budgets(product,repository,budget_id,max_calls,max_microusd) VALUES ($1,$2,$3,8,1000)',[scope.product,scope.repository,finalUnknownBudgetId]);
 const finalUnknownBinding=await finalUnknownProvider.evidence();
 const finalUnknownApproval=await approval(pools[0]).request({scope,operation:'provider.activate',evidence:finalUnknownBinding,credential:'manager'});
 await approval(pools[1]).recordDecision({scope,id:finalUnknownApproval.id,binding:finalUnknownApproval.binding,decision:'approved',credential:'owner'});
 // Clearing the disposable stop alone must not bypass the persistent breach.
 await assert.rejects(finalUnknownProvider.reserve({credential:'manager',approvalId:finalUnknownApproval.id}),/unresolved provider attempt/);
 // Remove the synthetic breach fixture only in this disposable database to
 // exercise the independent unknown-outcome path. No runtime reset API exists.
 await pools[0].query('DELETE FROM engineering_team_provider_outcomes WHERE binding=$1',[breachBinding]);
 await pools[0].query('DELETE FROM engineering_team_provider_attempts WHERE binding=$1',[breachBinding]);
 await finalUnknownProvider.reserve({credential:'manager',approvalId:finalUnknownApproval.id});
 const stoppedTask=await q.enqueue({scope,role,credential:'manager'});
 const running=await q.claim({scope,role,credential:'w1'});
 const governanceBudgetId=randomUUID();
 await pools[0].query('INSERT INTO engineering_team_spend_budgets(product,repository,budget_id,max_calls,max_microusd) VALUES ($1,$2,$3,8,1000)',[scope.product,scope.repository,governanceBudgetId]);
 const governanceSpend=pools.map(pool=>createSpendBudget({pool,...scope,budgetId:governanceBudgetId,ceilings:{fixture:100}}));
 await governanceSpend[0].reserve({model:'fixture'});
 // Hold the same governance lock on a separate connection and commit a quarantine
 // before the waiting spend reservation can evaluate its predicates.
 const guard=await pools[1].connect();
 try{
  await guard.query('BEGIN');
  await guard.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify([scope.product,scope.repository])]);
  await guard.query('INSERT INTO engineering_team_quarantine(product,repository,role,actor_id) VALUES ($1,$2,$3,$4)',[scope.product,scope.repository,role,'manager']);
  const pending=governanceSpend[0].reserve({model:'fixture'});
  const denied=assert.rejects(pending,/Spend budget denied/);
  await guard.query('COMMIT');
  await denied;
 }finally{await guard.query('ROLLBACK');guard.release();}
 await q2.quarantine({scope,role,credential:'manager'});
 await assert.rejects(make(pools[0]).finish({scope,role,credential:'w1',taskId:stoppedTask,leaseId:running.lease_id,outcome:'succeeded'}),/Governance denied/);
 await assert.rejects(q.claim({scope,role,credential:'w2'}),/Governance denied/);
 await assert.rejects(ledger(pools[1]).readFixturePrior({credential:'manager',id:runtimeResult.workflowId}),/Workflow unavailable/);
 await assert.rejects(governanceSpend[0].reserve({model:'fixture'}),/Spend budget denied/);
 await assert.rejects(reviewed(pools[1]).reserve({credential:'manager',approvalId:excessApproval.id,reviewEnvelope:excessEnvelope}),/Reservation denied/);
 const unknown=await outcomes[1].record({credential:'owner',binding:finalUnknownBinding});
 assert.deepEqual(unknown,{outcome:'unknown',executionAuthorized:false});
 assert.equal((await pools[0].query(stopQuery,stopArgs)).rowCount,1);
 const providerStopAlerts=await pools[1].query("SELECT actor_id FROM engineering_team_governance_alerts WHERE product=$1 AND repository=$2 AND event_type='stop.created'",stopArgs);
 assert.equal(providerStopAlerts.rowCount,2); // breach and unknown outcome, separated by disposable fixture reset
 assert.ok(providerStopAlerts.rows.every(row=>row.actor_id==='owner'));
 // Every role must observe the same durable emergency stop, including after restart.
 const stopRoleIdentities=new Map(sequence.map(r=>[r,{...scope,id:'stop-'+r,role:r,permission:'queue.work'}]));
 const stoppedQueue=createDurableQueue({pool:pools[1],scopes:[scope],authenticate:async c=>stopRoleIdentities.get(c)});
 for(const r of sequence)await assert.rejects(stoppedQueue.claim({scope,role:r,credential:r}),/Governance denied/);
 // A stop and unknown provider outcome in one repository must not block another tenant scope.
 const isolatedScope={...scope,repository:'fixture/isolated'};
 const isolatedIdentities=new Map([
  ['isolated-manager',{...isolatedScope,id:'isolated-manager',permission:'queue.manage'}],
  ['isolated-owner',{...isolatedScope,id:'isolated-owner',permission:'owner.approval'}]
 ]);
 const isolatedAuth=async c=>isolatedIdentities.get(c);
 const isolatedApprovals=pool=>createDurableApprovalPolicy({pool,scopes:[isolatedScope],authenticate:isolatedAuth});
 const isolatedBudgetId=randomUUID();
 const isolatedManifest=createActivationManifest({...providerManifest,scope:isolatedScope,budgetId:isolatedBudgetId});
 const isolatedPolicy=createQueuePolicyBridge({manifest:isolatedManifest,readQueueState:async()=>({repository:isolatedScope.repository,headSha:isolatedScope.sha,issue:{number:42,state:'open',isPullRequest:false,labels:['aca:auto/docs-test'],assignees:[]},activeIssueNumbers:[]})});
 const isolatedProvider=pool=>createProviderReservation({pool,manifest:isolatedManifest,policy:isolatedPolicy,authenticate:isolatedAuth,ceilings:{fixture:400}});
 await pools[0].query('INSERT INTO engineering_team_spend_budgets(product,repository,budget_id,max_calls,max_microusd) VALUES ($1,$2,$3,8,1000)',[isolatedScope.product,isolatedScope.repository,isolatedBudgetId]);
 const isolatedBinding=await isolatedProvider(pools[0]).evidence();
 const isolatedApproval=await isolatedApprovals(pools[0]).request({scope:isolatedScope,operation:'provider.activate',evidence:isolatedBinding,credential:'isolated-manager'});
 await isolatedApprovals(pools[1]).recordDecision({scope:isolatedScope,id:isolatedApproval.id,binding:isolatedApproval.binding,decision:'approved',credential:'isolated-owner'});
 assert.deepEqual(await isolatedProvider(pools[1]).reserve({credential:'isolated-manager',approvalId:isolatedApproval.id}),{binding:isolatedBinding,reserved:true,executionAuthorized:false});
 const isolatedOutcome=createProviderOutcome({pool:pools[0],scope:isolatedScope,authenticate:isolatedAuth});
 assert.deepEqual(await isolatedOutcome.record({credential:'isolated-owner',binding:isolatedBinding,usage:{inputTokens:1,outputTokens:1,actualMicrousd:1}}),{outcome:'completed',executionAuthorized:false});
 assert.equal((await pools[1].query(stopQuery,stopArgs)).rowCount,1);
 assert.equal((await pools[1].query('SELECT 1 FROM engineering_team_stops WHERE product=$1 AND repository=$2',[isolatedScope.product,isolatedScope.repository])).rowCount,0);
 assert.deepEqual((await pools[1].query('SELECT reserved_calls,reserved_microusd FROM engineering_team_spend_budgets WHERE product=$1 AND repository=$2 AND budget_id=$3',[isolatedScope.product,isolatedScope.repository,isolatedBudgetId])).rows[0],{reserved_calls:1,reserved_microusd:'400'});
 await q2.stop({scope,credential:'manager'});
 // A newly constructed reservation adapter must still deny admission after a durable stop.
 await assert.rejects(reviewed(pools[0]).reserve({credential:'manager',approvalId:excessApproval.id,reviewEnvelope:excessEnvelope}),/Reservation denied/);
 assert.equal((await pools[1].query('SELECT binding FROM engineering_team_provider_attempts WHERE binding=$1',[excessBinding])).rowCount,0);
 assert.deepEqual((await pools[1].query('SELECT reserved_calls,reserved_microusd FROM engineering_team_spend_budgets WHERE budget_id=$1',[providerBudgetId])).rows[0],{reserved_calls:2,reserved_microusd:'800'});
 await assert.rejects(governanceSpend[1].reserve({model:'fixture'}),/Spend budget denied/);
 assert.deepEqual((await pools[1].query('SELECT reserved_calls,reserved_microusd FROM engineering_team_spend_budgets WHERE budget_id=$1',[governanceBudgetId])).rows[0],{reserved_calls:1,reserved_microusd:'100'});
 await assert.rejects(make(pools[1]).enqueue({scope,role:'devops',credential:'manager'}),/Governance denied/);
 assert.equal(await q.cancel({scope,credential:'manager',taskId:stoppedTask}),true);

 // Recovery requires a distinct owner approval, exact evidence, no active lease,
 // and a single-use audit record. Exercise on an isolated disposable repository scope.
 const recoveryScope={...scope,repository:'fixture/recovery'};
 const recoveryRole='qa-testing';
 const recoveryIdentities=new Map([
  ['recovery-manager',{...recoveryScope,id:'recovery-manager',permission:'queue.manage'}],
  ['recovery-owner',{...recoveryScope,id:'recovery-owner',permission:'owner.approval'}],
  ['recovery-worker',{...recoveryScope,id:'recovery-worker',role:recoveryRole,permission:'queue.work'}]
 ]);
 const recoveryAuth=async c=>recoveryIdentities.get(c);
 const recoveryQueue=createDurableQueue({pool:pools[0],scopes:[recoveryScope],authenticate:recoveryAuth});
 const recoveryApprovals=createDurableApprovalPolicy({pool:pools[0],scopes:[recoveryScope],authenticate:recoveryAuth});
 const {createGovernanceRecovery}=require('../src/automation/engineeringTeam/governanceRecovery');
 const recoveryGate=createGovernanceRecovery({pool:pools[0],scope:recoveryScope,authenticate:recoveryAuth});
 const quarantineTask=await recoveryQueue.enqueue({scope:recoveryScope,role:recoveryRole,credential:'recovery-manager'});
 await recoveryQueue.quarantine({scope:recoveryScope,role:recoveryRole,credential:'recovery-manager'});
 await recoveryQueue.quarantine({scope:recoveryScope,role:recoveryRole,credential:'recovery-manager'}); // idempotent: no duplicate alert
 await assert.rejects(recoveryQueue.claim({scope:recoveryScope,role:recoveryRole,credential:'recovery-worker'}),/Governance denied/);
 const quarantineIncident=(await pools[0].query('SELECT incident_id FROM engineering_team_quarantine WHERE product=$1 AND repository=$2 AND role=$3',[recoveryScope.product,recoveryScope.repository,recoveryRole])).rows[0].incident_id;
 const quarantineEvidence=recoveryGate.evidence({action:'clear-quarantine',role:recoveryRole,incidentId:quarantineIncident});
 const quarantineRequest=await recoveryApprovals.request({scope:recoveryScope,operation:'queue.recover',evidence:quarantineEvidence,credential:'recovery-manager'});
 await recoveryApprovals.recordDecision({scope:recoveryScope,id:quarantineRequest.id,binding:quarantineRequest.binding,decision:'approved',credential:'recovery-owner'});
 assert.deepEqual(await recoveryGate.recover({credential:'recovery-manager',approvalId:quarantineRequest.id,action:'clear-quarantine',role:recoveryRole,incidentId:quarantineIncident,evidenceSha256:quarantineEvidence}),{action:'clear-quarantine',role:recoveryRole,recovered:true,executionAuthorized:false});
 await assert.rejects(recoveryGate.recover({credential:'recovery-manager',approvalId:quarantineRequest.id,action:'clear-quarantine',role:recoveryRole,incidentId:quarantineIncident,incidentId:quarantineIncident,evidenceSha256:quarantineEvidence}),/incident mismatch|already consumed/);
 const activeRecoveryLease=await recoveryQueue.claim({scope:recoveryScope,role:recoveryRole,credential:'recovery-worker',expectedTaskId:quarantineTask});
 const afterStopTask=await recoveryQueue.enqueue({scope:recoveryScope,role:recoveryRole,credential:'recovery-manager'});
 await recoveryQueue.stop({scope:recoveryScope,credential:'recovery-manager'});
 await recoveryQueue.stop({scope:recoveryScope,credential:'recovery-manager'}); // idempotent: no duplicate alert
 const stopIncident=(await pools[0].query('SELECT incident_id FROM engineering_team_stops WHERE product=$1 AND repository=$2',[recoveryScope.product,recoveryScope.repository])).rows[0].incident_id;
 const stopEvidence=recoveryGate.evidence({action:'clear-stop',incidentId:stopIncident});
 const stopRequest=await recoveryApprovals.request({scope:recoveryScope,operation:'queue.recover',evidence:stopEvidence,credential:'recovery-manager'});
 await recoveryApprovals.recordDecision({scope:recoveryScope,id:stopRequest.id,binding:stopRequest.binding,decision:'approved',credential:'recovery-owner'});
 await assert.rejects(recoveryGate.recover({credential:'recovery-manager',approvalId:stopRequest.id,action:'clear-stop',incidentId:stopIncident,evidenceSha256:stopEvidence}),/active lease/);
 await recoveryQueue.cancel({scope:recoveryScope,credential:'recovery-manager',taskId:quarantineTask});
 assert.deepEqual(await recoveryGate.recover({credential:'recovery-manager',approvalId:stopRequest.id,action:'clear-stop',incidentId:stopIncident,evidenceSha256:stopEvidence}),{action:'clear-stop',role:null,recovered:true,executionAuthorized:false});
 const resumedLease=await recoveryQueue.claim({scope:recoveryScope,role:recoveryRole,credential:'recovery-worker',expectedTaskId:afterStopTask});
 assert.equal(resumedLease.id,afterStopTask);
 assert.equal(await recoveryQueue.finish({scope:recoveryScope,role:recoveryRole,credential:'recovery-worker',taskId:afterStopTask,leaseId:resumedLease.lease_id,outcome:'succeeded'}),'succeeded');
 // Even an owner-approved stop clear cannot bypass an unresolved provider attempt.
 const unresolvedBudgetId=randomUUID(),providerApprovalEvidence='8'.repeat(64),recoveryProviderBinding='9'.repeat(64);
 await pools[0].query('INSERT INTO engineering_team_spend_budgets(product,repository,budget_id,max_calls,max_microusd) VALUES ($1,$2,$3,1,10)',[recoveryScope.product,recoveryScope.repository,unresolvedBudgetId]);
 const providerApprovalRequest=await recoveryApprovals.request({scope:recoveryScope,operation:'provider.activate',evidence:providerApprovalEvidence,credential:'recovery-manager'});
 await recoveryApprovals.recordDecision({scope:recoveryScope,id:providerApprovalRequest.id,binding:providerApprovalRequest.binding,decision:'approved',credential:'recovery-owner'});
 await pools[0].query('INSERT INTO engineering_team_provider_attempts(binding,approval_id,product,repository,head_sha,budget_id,model,reserved_microusd,reserved_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',[recoveryProviderBinding,providerApprovalRequest.id,recoveryScope.product,recoveryScope.repository,recoveryScope.sha,unresolvedBudgetId,'fixture',1,'recovery-manager']);
 await recoveryQueue.stop({scope:recoveryScope,credential:'recovery-manager'});
 const unresolvedStopIncident=(await pools[0].query('SELECT incident_id FROM engineering_team_stops WHERE product=$1 AND repository=$2',[recoveryScope.product,recoveryScope.repository])).rows[0].incident_id;
 const unresolvedStopEvidence=recoveryGate.evidence({action:'clear-stop',incidentId:unresolvedStopIncident});
 const unresolvedStopRequest=await recoveryApprovals.request({scope:recoveryScope,operation:'queue.recover',evidence:unresolvedStopEvidence,credential:'recovery-manager'});
 await recoveryApprovals.recordDecision({scope:recoveryScope,id:unresolvedStopRequest.id,binding:unresolvedStopRequest.binding,decision:'approved',credential:'recovery-owner'});
 await assert.rejects(recoveryGate.recover({credential:'recovery-manager',approvalId:unresolvedStopRequest.id,action:'clear-stop',incidentId:unresolvedStopIncident,evidenceSha256:unresolvedStopEvidence}),/unresolved provider attempt/);
 assert.equal((await pools[1].query('SELECT count(*)::int AS n FROM engineering_team_stops WHERE product=$1 AND repository=$2',[recoveryScope.product,recoveryScope.repository])).rows[0].n,1);
 assert.equal((await pools[1].query('SELECT count(*)::int AS n FROM engineering_team_governance_recoveries WHERE product=$1 AND repository=$2',[recoveryScope.product,recoveryScope.repository])).rows[0].n,2);
 const alertRows=await pools[1].query('SELECT event_type,role,approval_id FROM engineering_team_governance_alerts WHERE product=$1 AND repository=$2 ORDER BY created_at,id',[recoveryScope.product,recoveryScope.repository]);
 assert.deepEqual(alertRows.rows.map(x=>x.event_type),['quarantine.created','quarantine.cleared','stop.created','stop.cleared','stop.created']);
 assert.equal(alertRows.rows[0].role,recoveryRole);
 assert.equal(alertRows.rows[1].role,recoveryRole);
 assert.equal(alertRows.rows[1].approval_id,quarantineRequest.id);
 assert.equal(alertRows.rows[3].approval_id,stopRequest.id);
 assert.equal(alertRows.rows[4].approval_id,null);
 const {createGovernanceAlertReader}=require('../src/automation/engineeringTeam/governanceAlertReader');
 const alertReader=createGovernanceAlertReader({pool:pools[1],scope:recoveryScope,authenticate:recoveryAuth});
 const visibleAlerts=await alertReader.list({credential:'recovery-manager',limit:10});
 assert.equal(visibleAlerts.length,5);
 const pendingAlerts=await alertReader.backlog({credential:'recovery-manager',limit:2});
 assert.equal(pendingAlerts.length,2);
 assert.equal(pendingAlerts[0].event_type,'quarantine.created');
 const alertId=pendingAlerts[0].id;
 await assert.rejects(alertReader.acknowledge({credential:'recovery-worker',alertId}),/identity denied/);
 const secondReader=createGovernanceAlertReader({pool:pools[0],scope:recoveryScope,authenticate:recoveryAuth});
 const ackResults=await Promise.all([alertReader,secondReader].map(reader=>reader.acknowledge({credential:'recovery-manager',alertId})));
 assert.equal(ackResults.filter(x=>x.newAcknowledgement).length,1);
 assert.ok(ackResults.every(x=>x.acknowledged&&!x.executionAuthorized));
 assert.equal((await secondReader.backlog({credential:'recovery-manager',limit:100})).length,4);
 assert.equal((await secondReader.list({credential:'recovery-manager',limit:100})).length,5);
 assert.equal((await pools[1].query('SELECT count(*)::int AS n FROM engineering_team_governance_acknowledgements WHERE alert_id=$1',[alertId])).rows[0].n,1);
 assert.equal((await pools[1].query('SELECT 1 FROM engineering_team_stops WHERE product=$1 AND repository=$2',[recoveryScope.product,recoveryScope.repository])).rowCount,1);

 assert.equal(visibleAlerts[0].event_type,'stop.created'); // unresolved stop is the newest journal event
 assert.ok(visibleAlerts.every(x=>!Object.hasOwn(x,'evidence_sha256')&&!Object.hasOwn(x,'credential')));
 assert.equal(recoveryGate.executionAllowed(),false);

 // A spend-only reservation is deliberately not a request-bound dispatch receipt;
 // the SDK adapter must reject it before any provider call.
 const boundaryScope={...scope,repository:'fixture/provider-boundary'},boundaryBudgetId=randomUUID();
 await pools[0].query('INSERT INTO engineering_team_spend_budgets(product,repository,budget_id,max_calls,max_microusd) VALUES ($1,$2,$3,1,100)',[boundaryScope.product,boundaryScope.repository,boundaryBudgetId]);
 const boundaryBudget=createSpendBudget({pool:pools[0],...boundaryScope,budgetId:boundaryBudgetId,ceilings:{fixture:100}});
 const {createOpenAITransport}=require('../src/automation/engineeringTeam/openaiTransport');
 let boundaryAuthorizations=0,boundaryProviderCalls=0;
 const boundaryModels=Object.fromEntries(sequence.map(r=>[r,'fixture']));
 const boundaryTransport=createOpenAITransport({models:boundaryModels,authorize:async()=>++boundaryAuthorizations===1,budget:boundaryBudget,client:{responses:{create:async()=>{boundaryProviderCalls++;return {status:'completed',usage:{input_tokens:1,output_tokens:1},output_text:'{}'};}}}});
 await assert.rejects(boundaryTransport.generate({role:'orchestrator',mode:'proposal-only',input:'{}',instructions:'fixture',schema:{type:'object'}}),/^Error: Provider request failed$/);
 assert.equal(boundaryAuthorizations,1);
 assert.equal(boundaryProviderCalls,0);
 assert.deepEqual(boundaryTransport.usage(),{calls:0,inputTokens:0,outputTokens:0});
 assert.deepEqual((await pools[1].query('SELECT reserved_calls,reserved_microusd FROM engineering_team_spend_budgets WHERE budget_id=$1',[boundaryBudgetId])).rows[0],{reserved_calls:1,reserved_microusd:'100'});

 // Same repository and SHA, different product scopes: stop and worker identities
 // must remain isolated across products.
 const productAScope={...scope,repository:'fixture/multi-product'};
 const productBScope={...productAScope,product:'social-engagement'};
 const productIdentities=new Map([
  ['product-a-manager',{...productAScope,id:'product-a-manager',permission:'queue.manage'}],
  ['product-a-worker',{...productAScope,id:'product-a-worker',role:'backend-developer',permission:'queue.work'}],
  ['product-b-manager',{...productBScope,id:'product-b-manager',permission:'queue.manage'}],
  ['product-b-worker',{...productBScope,id:'product-b-worker',role:'backend-developer',permission:'queue.work'}]
 ]);
 const productQueue=createDurableQueue({pool:pools[0],scopes:[productAScope,productBScope],authenticate:async c=>productIdentities.get(c)});
 const productATask=await productQueue.enqueue({scope:productAScope,role:'backend-developer',credential:'product-a-manager'});
 const productBTask=await productQueue.enqueue({scope:productBScope,role:'backend-developer',credential:'product-b-manager'});
 await productQueue.stop({scope:productAScope,credential:'product-a-manager'});
 await assert.rejects(productQueue.claim({scope:productAScope,role:'backend-developer',credential:'product-a-worker',expectedTaskId:productATask}),/Governance denied/);
 await assert.rejects(productQueue.claim({scope:productBScope,role:'backend-developer',credential:'product-a-worker',expectedTaskId:productBTask}),/Identity denied/);
 const productBLease=await productQueue.claim({scope:productBScope,role:'backend-developer',credential:'product-b-worker',expectedTaskId:productBTask});
 assert.equal(productBLease.id,productBTask);
 assert.equal(await productQueue.finish({scope:productBScope,role:'backend-developer',credential:'product-b-worker',taskId:productBTask,leaseId:productBLease.lease_id,outcome:'succeeded'}),'succeeded');
 assert.equal((await pools[1].query('SELECT state FROM engineering_team_tasks WHERE id=$1',[productATask])).rows[0].state,'queued');
 assert.equal((await pools[1].query('SELECT state FROM engineering_team_tasks WHERE id=$1',[productBTask])).rows[0].state,'succeeded');

 // Disposable CI privilege proof: a non-login observer role can read only
 // governance rows in its fixed product/repository and cannot mutate anything.
 const observer=await pools[0].connect();
 try {
  await observer.query('BEGIN');
  await observer.query('CREATE ROLE aca_ci_restricted_observer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT');
  await observer.query('GRANT USAGE ON SCHEMA public TO aca_ci_restricted_observer');
  await observer.query('GRANT SELECT (id,product,repository) ON engineering_team_governance_alerts TO aca_ci_restricted_observer');
  await observer.query('GRANT SELECT (alert_id) ON engineering_team_governance_acknowledgements TO aca_ci_restricted_observer');
  await observer.query('ALTER TABLE engineering_team_governance_alerts ENABLE ROW LEVEL SECURITY');
  await observer.query('ALTER TABLE engineering_team_governance_acknowledgements ENABLE ROW LEVEL SECURITY');
  await observer.query("CREATE POLICY ci_observer_alert_scope ON engineering_team_governance_alerts FOR SELECT TO aca_ci_restricted_observer USING (product='aca' AND repository='fixture/recovery')");
  await observer.query("CREATE POLICY ci_observer_ack_scope ON engineering_team_governance_acknowledgements FOR SELECT TO aca_ci_restricted_observer USING (EXISTS (SELECT 1 FROM engineering_team_governance_alerts a WHERE a.id=alert_id))");
  await observer.query('SET LOCAL ROLE aca_ci_restricted_observer');
  const {createRestrictedManagerRuntime}=require('../src/automation/engineeringTeam/restrictedManagerRuntime');
  const runtime=createRestrictedManagerRuntime({scope:recoveryScope,issue:118,githubToken:'fixture-only-token',fetchImpl:async url=>new Response(JSON.stringify(url.includes('/issues/')?{number:118,state:'open',labels:[]}:{total_count:1,workflow_runs:[{id:1,name:'CI',status:'completed',conclusion:'success',head_sha:recoveryScope.sha}]})),readOnlyPool:observer});
  const report=await runtime.observe();
  assert.equal(report.status,'observed');
  assert.deepEqual(report.governance,{status:'observed',scope:'repository-wide',pending:4,partial:false});
  assert.equal(report.executionAuthorized,false);
  assert.equal(report.writeAuthorized,false);
  assert.equal((await observer.query('SELECT count(*)::int AS n FROM engineering_team_governance_alerts WHERE repository=$1',[productAScope.repository])).rows[0].n,0);
  for(const sql of ['SELECT * FROM engineering_team_tasks','SELECT actor_id FROM engineering_team_governance_alerts','DELETE FROM engineering_team_governance_alerts','UPDATE engineering_team_governance_acknowledgements SET alert_id=alert_id']){
   await observer.query('SAVEPOINT denied_operation');
   await assert.rejects(observer.query(sql),e=>e.code==='42501');
   await observer.query('ROLLBACK TO SAVEPOINT denied_operation');
   await observer.query('RELEASE SAVEPOINT denied_operation');
  }
 } finally {
  await observer.query('ROLLBACK');
  observer.release();
 }
 // SEC-09: durable publication reconciliation is requester-, approval-, and
 // exact-revision-bound; replay is idempotent and evidence is append-only.
 const {createReconciliationStore}=require('../src/automation/engineeringTeam/publicationReconciliationStore');
 const reconScope={product:'aca',repository:'fixture/publication-reconciliation',sha:'a'.repeat(40)};
 const reconHead='c'.repeat(40),reconBranch='aca-agent-draft-'+'2'.repeat(16);
 const reconIdentity={id:'publication-manager',permission:'queue.manage',...reconScope};
 const reconAuth=async credential=>credential==='publication-manager'?reconIdentity:credential==='independent-owner'?{...reconScope,id:'independent-owner',permission:'owner.approval'}:null;
 const reconApprovals=createDurableApprovalPolicy({pool:pools[0],scopes:[reconScope],authenticate:reconAuth});
 const reconReservations=createPublicationReservation({pool:pools[0],scope:reconScope,authenticate:reconAuth});
 async function reserveRecon(seed){
  const request=fixturePublicationRequest(reconScope,seed[0]);const evidenceSha256=request.evidenceSha256;
  const details={request,evidenceSha256,baseBranch:'main',headBranch:reconBranch,headSha:reconHead};
  const binding=computePublicationBinding({...details,repository:reconScope.repository});
  const approval=await reconApprovals.request({scope:reconScope,operation:'github.write',evidence:binding,credential:'publication-manager'});
  assert.equal(new Set([approval.binding,binding,evidenceSha256]).size,3);
  await reconApprovals.recordDecision({scope:reconScope,id:approval.id,binding:approval.binding,decision:'approved',credential:'independent-owner'});
  const input={credential:'publication-manager',approvalId:approval.id,binding,...details};
  await assert.rejects(reconReservations.reserve({...input,headSha:'d'.repeat(40)}),/Reservation denied/);
  await assert.rejects(reconReservations.reserve({...input,binding:approval.binding}),/Reservation denied/);
  await assert.rejects(reconReservations.reserve({...input,request:undefined}),/Reservation denied/);
  await assert.rejects(reconReservations.reserve({...input,request:{...request,reviewDigest:'f'.repeat(64)}}),/Reservation denied/);
  await assert.rejects(reconReservations.reserve({...input,request:{...request,scope:{...reconScope,sha:reconHead}}}),/Reservation denied/);
  assert.equal((await reconReservations.reserve(input)).executionAuthorized,false);
  return binding;
 }
 const reconBinding=await reserveRecon('b'.repeat(64));
 const {createGitHubPublicationEvidenceBoundary}=require('../src/automation/engineeringTeam/githubPublicationEvidenceBoundary');
 const githubPr={number:77,body:'Evidence binding: '+reconBinding,draft:true,state:'open',base:{repo:{full_name:reconScope.repository},ref:'main',sha:reconScope.sha},head:{repo:{full_name:reconScope.repository},ref:reconBranch,sha:reconHead}};
 const githubResponse=async()=>new Response(JSON.stringify([githubPr]));
 const collectorFetch=async(url,options)=>{assert.equal(options.method,'GET');return githubResponse();};
 const independentVerifierFetch=async(url,options)=>{assert.equal(options.method,'GET');return githubResponse();};
 const evidenceBoundary=createGitHubPublicationEvidenceBoundary({collectFetch:collectorFetch,verifyFetch:independentVerifierFetch,collectToken:async()=>'disposable-collector-read-token',verifyToken:async()=>'disposable-independent-read-token'});
 const reconStore=createReconciliationStore({pool:pools[0],authenticate:reconAuth,collect:evidenceBoundary.collect,verifyObservation:evidenceBoundary.verify,baseBranch:'main',headBranch:reconBranch});
 const reconResult=await reconStore.record({credential:'publication-manager',binding:reconBinding});
 assert.equal(reconResult.state,'observed-draft');
 assert.equal(reconResult.number,77);
 assert.equal(reconResult.retryAuthorized,false);
 assert.equal(reconResult.executionAuthorized,false);
 const reconReplay=await reconStore.record({credential:'publication-manager',binding:reconBinding});
 assert.equal(reconReplay.replayed,true);
 assert.equal(reconReplay.retryAuthorized,false);
 assert.equal((await pools[1].query('SELECT count(*)::int AS n FROM engineering_team_publication_reconciliation WHERE binding=$1',[reconBinding])).rows[0].n,1);
 await assert.rejects(pools[0].query('UPDATE engineering_team_publication_reconciliation SET state=state WHERE binding=$1',[reconBinding]),e=>e.code==='P0001');
 await assert.rejects(pools[0].query('DELETE FROM engineering_team_publication_reconciliation WHERE binding=$1',[reconBinding]),e=>e.code==='P0001');
 await assert.rejects(pools[0].query('TRUNCATE engineering_team_publication_reconciliation'),e=>e.code==='P0001');

 // A second reservation proves failed independent verification rolls back the
 // transaction and leaves no durable reconciliation row.
 const rollbackBinding=await reserveRecon('f'.repeat(64));
 const tamperedPr={...githubPr,head:{...githubPr.head,sha:'d'.repeat(40)}};
 const rollbackBoundary=createGitHubPublicationEvidenceBoundary({
  collectFetch:async()=>new Response(JSON.stringify([githubPr])),
  verifyFetch:async()=>new Response(JSON.stringify([tamperedPr])),
  collectToken:async()=>'disposable-collector-read-token',
  verifyToken:async()=>'disposable-independent-read-token'
 });
 const rollbackStore=createReconciliationStore({pool:pools[0],authenticate:reconAuth,collect:rollbackBoundary.collect,verifyObservation:rollbackBoundary.verify,baseBranch:'main',headBranch:reconBranch});
 await assert.rejects(rollbackStore.record({credential:'publication-manager',binding:rollbackBinding}),/authentication failed/);
 assert.equal((await pools[1].query('SELECT count(*)::int AS n FROM engineering_team_publication_reconciliation WHERE binding=$1',[rollbackBinding])).rows[0].n,0);


});
