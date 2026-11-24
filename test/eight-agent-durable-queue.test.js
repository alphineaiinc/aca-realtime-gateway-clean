'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createDurableQueue}=require('../src/automation/engineeringTeam/durableQueue');
const {createDurableApprovalPolicy}=require('../src/automation/engineeringTeam/durableApproval');
const scope={product:'aca',repository:'fixture/aca',sha:'a'.repeat(40)};
const role='backend-developer';
function setup(){
 const queries=[];
 const identities=new Map([['manager',{...scope,id:'manager',permission:'queue.manage'}],['worker',{...scope,id:'worker-1',permission:'queue.work',role}],['other',{...scope,id:'worker-2',permission:'queue.work',role:'qa-testing'}]]);
 const query=async(sql,params=[])=>{
  if(['BEGIN','COMMIT','ROLLBACK'].includes(sql)||sql.startsWith('SELECT pg_advisory'))return {rowCount:0,rows:[]};
  if(sql.startsWith('SELECT EXISTS'))return {rowCount:1,rows:[{blocked:false}]};
  queries.push({sql,params});return {rowCount:1,rows:[{id:params[0],state:'succeeded',lease_id:'fixture'}]};
 };
 const pool={query,async connect(){return {query,release(){}};}};
 const queue=createDurableQueue({pool,scopes:[scope],authenticate:async credential=>identities.get(credential)});
 return {queue,queries};
}
test('queue rejects unknown scope, wrong role and unauthorized manager before database access',async()=>{
 const {queue,queries}=setup();
 await assert.rejects(queue.enqueue({scope,role,credential:'worker'}));
 await assert.rejects(queue.claim({scope,role,credential:'other'}));
 await assert.rejects(queue.claim({scope:{...scope,sha:'b'.repeat(40)},role,credential:'worker'}));
 assert.equal(queries.length,0);
});
test('queue uses scoped atomic claim and authenticated worker identity',async()=>{
 const {queue,queries}=setup();
 await queue.enqueue({scope,role,credential:'manager'});
 await queue.claim({scope,role,credential:'worker',workerId:'attacker'});
 assert.match(queries[1].sql,/FOR UPDATE SKIP LOCKED/);
 assert.equal(queries[1].params[4],'worker-1');
 assert.match(queries[1].sql,/engineering_team_queue_audit/);
});
test('completion requires current lease, scope, role and authenticated worker',async()=>{
 const {queue,queries}=setup();
 await queue.finish({scope,role,credential:'worker',taskId:'fixture-task',leaseId:'fixture-lease',outcome:'succeeded'});
 assert.match(queries[0].sql,/lease_until>clock_timestamp\(\)/);
 assert.deepEqual(queries[0].params.slice(3),[role,'worker-1','fixture-task','fixture-lease','succeeded']);
 await assert.rejects(queue.finish({scope,role,credential:'worker',taskId:'x',leaseId:'y',outcome:'approved'}));
 assert.equal(queries.length,1);
});
test('expiry and cancellation require manager identity and do not dispatch',async()=>{
 const {queue,queries}=setup();
 await assert.rejects(queue.expire({scope,credential:'worker'}));
 await queue.expire({scope,credential:'manager'});
 await queue.cancel({scope,credential:'manager',taskId:'fixture'});
 assert.match(queries[0].sql,/SET state='failed'/);
 assert.match(queries[1].sql,/SET state='cancelled'/);
});

test('persistent governance mutations require manager credentials',async()=>{
 const {queue,queries}=setup();
 await assert.rejects(queue.stop({scope,credential:'worker'}));
 await assert.rejects(queue.quarantine({scope,role,credential:'worker'}));
 assert.equal(queries.length,0);
 await queue.quarantine({scope,role,credential:'manager'});
 await queue.stop({scope,credential:'manager'});
 assert.match(queries[0].sql,/engineering_team_quarantine/);
 assert.match(queries[1].sql,/engineering_team_governance_alerts/);
 assert.match(queries[1].sql,/quarantine.created/);
 assert.match(queries[2].sql,/engineering_team_stops/);
 assert.match(queries[3].sql,/engineering_team_governance_alerts/);
 assert.match(queries[3].sql,/stop.created/);
});

test('scope mutation during asynchronous authentication cannot change the authenticated queue scope',async()=>{
 const mutable={...scope};
 const queue=createDurableQueue({pool:{query:async()=>({rowCount:1,rows:[{}]}),connect:async()=>({query:async sql=>sql==='BEGIN'||sql==='COMMIT'?{rowCount:0,rows:[]}:sql.startsWith('SELECT pg_advisory')?{rowCount:0,rows:[]}:sql.startsWith('SELECT EXISTS')?{rowCount:1,rows:[{blocked:false}]}:{rowCount:1,rows:[{id:'task'}]},release(){}})},scopes:[mutable],authenticate:async()=>{mutable.product='product-b';return {id:'attacker',product:'product-b',repository:scope.repository,sha:scope.sha,permission:'queue.manage'};}});
 await assert.rejects(queue.enqueue({scope:mutable,role,credential:'credential'}),/Identity denied/);
});
test('durable approval rejects scope mutation during asynchronous authentication',async()=>{
 const mutable={...scope};
 const approval=createDurableApprovalPolicy({pool:{query:async()=>({rowCount:1,rows:[{id:'approval'}]})},scopes:[mutable],authenticate:async()=>{mutable.product='product-b';return {id:'attacker',product:'product-b',repository:scope.repository,sha:scope.sha,permission:'queue.manage'};}});
 await assert.rejects(approval.request({scope:mutable,operation:'provider.activate',evidence:'a'.repeat(64),credential:'credential'}),/Identity denied/);
});

test('durable approval owner decision rejects scope mutation during asynchronous authentication',async()=>{
 const mutable={...scope},queries=[];
 const approval=createDurableApprovalPolicy({pool:{query:async(sql,params)=>{queries.push({sql,params});return {rowCount:1,rows:[{id:'approval',state:'approved'}]};}},scopes:[mutable],authenticate:async()=>{mutable.product='product-b';return {id:'attacker',product:'product-b',repository:scope.repository,sha:scope.sha,permission:'owner.approval'};}});
 await assert.rejects(approval.recordDecision({scope:mutable,id:'123e4567-e89b-42d3-a456-426614174000',binding:'b'.repeat(64),credential:'credential',decision:'approved'}),/Identity denied/);
 assert.equal(queries.length,0);
});
