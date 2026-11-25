'use strict';
const {randomUUID,createHash}=require('node:crypto');
const {validateProposal}=require('./contracts');
const {getRole}=require('./registry');
const {sequence}=require('./offlineTeam');
const scopeKey=s=>JSON.stringify([s.product,s.repository,s.sha]);
const validScope=s=>s&&typeof s.product==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/.test(s.product)&&typeof s.repository==='string'&&/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(s.repository)&&s.repository.length<=200&&typeof s.sha==='string'&&/^[a-f0-9]{40}$/.test(s.sha);
function createDurableQueue({pool,scopes,authenticate,leaseSeconds=60,fixtureProposalStorage=false}={}){
 if(!pool||typeof pool.query!=='function'||typeof authenticate!=='function'||!Array.isArray(scopes)||!scopes.length||!scopes.every(validScope)||!Number.isSafeInteger(leaseSeconds)||leaseSeconds<5||leaseSeconds>300)throw Error('Invalid queue configuration');
 const allowed=new Set(scopes.map(scopeKey));
 function checkScope(s){if(!validScope(s)||!allowed.has(scopeKey(s)))throw Error('Scope denied');return [s.product,s.repository,s.sha];}
 async function identity(credential,scope,role,permission){
  const expectedScopeKey=scopeKey(scope);
  const actor=await authenticate(credential);
  if(!actor||typeof actor.id!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/.test(actor.id)||actor.permission!==permission||scopeKey(actor)!==expectedScopeKey||(role===null?actor.role!==undefined:actor.role!==role))throw Error('Identity denied');
  return actor.id;
 }
 // Serialize governance changes and queue actions on a scope-specific transaction lock.
 async function guarded(params,work){
  if(typeof pool.connect!=='function')throw Error('Transactional queue pool required');
  const client=await pool.connect();let discard=false;
  try{
   await client.query('BEGIN');
   await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(params.slice(0,2))]);
   const result=await work(client);
   await client.query('COMMIT');return result;
  }catch(e){try{await client.query('ROLLBACK');}catch{discard=true;}throw e;}
  finally{client.release(discard);}
 }
 async function assertActive(client,params,role){
  const result=await client.query('SELECT EXISTS(SELECT 1 FROM engineering_team_stops WHERE product=$1 AND repository=$2) OR EXISTS(SELECT 1 FROM engineering_team_quarantine WHERE product=$1 AND repository=$2 AND role=$3) AS blocked',[...params.slice(0,2),role]);
  if(result.rows[0]?.blocked!==false)throw Error('Governance denied');
 }
 return Object.freeze({
  async stop({scope,credential}){
   const params=checkScope(scope);const actor=await identity(credential,scope,null,'queue.manage');
   return guarded(params,async client=>{
    if(await identity(credential,{product:params[0],repository:params[1],sha:params[2]},null,'queue.manage')!==actor)throw Error('Identity denied');
    const inserted=await client.query('INSERT INTO engineering_team_stops(product,repository,actor_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING product',[...params.slice(0,2),actor]);
    if(inserted.rowCount===1)await client.query("INSERT INTO engineering_team_governance_alerts(id,product,repository,event_type,actor_id) VALUES ($1,$2,$3,'stop.created',$4)",[randomUUID(),...params.slice(0,2),actor]);
    return true;
   });
  },
  async quarantine({scope,role,credential}){
   const params=checkScope(scope);getRole(role);const actor=await identity(credential,scope,null,'queue.manage');
   return guarded(params,async client=>{
    if(await identity(credential,{product:params[0],repository:params[1],sha:params[2]},null,'queue.manage')!==actor)throw Error('Identity denied');
    const inserted=await client.query('INSERT INTO engineering_team_quarantine(product,repository,role,actor_id) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING role',[...params.slice(0,2),role,actor]);
    if(inserted.rowCount===1)await client.query("INSERT INTO engineering_team_governance_alerts(id,product,repository,event_type,role,actor_id) VALUES ($1,$2,$3,'quarantine.created',$4,$5)",[randomUUID(),...params.slice(0,2),role,actor]);
    return true;
   });
  },
  async enqueue({scope,role,credential,workflowId,workflowStep}){
   const params=checkScope(scope);getRole(role);const actor=await identity(credential,scope,null,'queue.manage');
   return guarded(params,async client=>{
    if(await identity(credential,{product:params[0],repository:params[1],sha:params[2]},null,'queue.manage')!==actor)throw Error('Identity denied');
    await assertActive(client,params,role);
   const id=randomUUID();
   if(workflowId!==undefined||workflowStep!==undefined){
    if(fixtureProposalStorage!==true||typeof workflowId!=='string'||!Number.isSafeInteger(workflowStep)||sequence[workflowStep]!==role)throw Error('Workflow enqueue denied');
    const w=await client.query('SELECT id FROM engineering_team_workflows WHERE id=$1 AND product=$2 AND repository=$3 AND head_sha=$4 AND next_step=$5 FOR UPDATE',[workflowId,...params,workflowStep]);
    if(w.rowCount!==1)throw Error('Workflow enqueue denied');
   }
   const result=await client.query(`WITH task AS (INSERT INTO engineering_team_tasks(id,product,repository,head_sha,role,workflow_id,workflow_step) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id), audit AS (INSERT INTO engineering_team_queue_audit(task_id,event) SELECT id,'queued' FROM task) SELECT id FROM task`,[id,...params,role,workflowId??null,workflowStep??null]);
   if(result.rowCount!==1)throw Error('Queue insert failed');return id;
   });
  },
  async inspectWorkflowStep({scope,workflowId,workflowStep,credential}){
   const params=checkScope(scope);const actor=await identity(credential,scope,null,'queue.manage');
   if(typeof workflowId!=='string'||!Number.isSafeInteger(workflowStep)||workflowStep<0||workflowStep>=sequence.length)throw Error('Workflow inspection denied');
   return guarded(params,async client=>{
    if(await identity(credential,{product:params[0],repository:params[1],sha:params[2]},null,'queue.manage')!==actor)throw Error('Identity denied');
    await assertActive(client,params,sequence[workflowStep]);
    const result=await client.query(`SELECT t.id,t.role,t.state,t.attempts,t.lease_until,
      EXISTS(SELECT 1 FROM engineering_team_proposal_receipts r WHERE r.task_id=t.id) AS has_receipt
      FROM engineering_team_tasks t JOIN engineering_team_workflows w ON w.id=t.workflow_id
      WHERE t.workflow_id=$1 AND t.workflow_step=$2 AND t.product=$3 AND t.repository=$4 AND t.head_sha=$5
      AND w.product=t.product AND w.repository=t.repository AND w.head_sha=t.head_sha`,[workflowId,workflowStep,...params]);
    if(result.rowCount>1)throw Error('Workflow task integrity failure');
    return result.rows[0]?Object.freeze({...result.rows[0]}):null;
   });
  },
  async claim({scope,role,credential,expectedTaskId}){
   const params=checkScope(scope);getRole(role);const worker=await identity(credential,scope,role,'queue.work');const lease=randomUUID();
   return guarded(params,async client=>{
    if(await identity(credential,{product:params[0],repository:params[1],sha:params[2]},role,'queue.work')!==worker)throw Error('Identity denied');
    await assertActive(client,params,role);
   const result=await client.query(`WITH candidate AS (SELECT id FROM engineering_team_tasks WHERE product=$1 AND repository=$2 AND head_sha=$3 AND role=$4 AND state='queued' AND attempts<2 AND (($8::uuid IS NULL AND workflow_id IS NULL) OR id=$8::uuid) ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED), task AS (UPDATE engineering_team_tasks t SET state='running',attempts=attempts+1,worker_id=$5,lease_id=$6,lease_until=clock_timestamp()+make_interval(secs=>$7) FROM candidate c WHERE t.id=c.id RETURNING t.id,t.lease_id,t.attempts,t.lease_until), audit AS (INSERT INTO engineering_team_queue_audit(task_id,event) SELECT id,'claimed' FROM task) SELECT * FROM task`,[...params,role,worker,lease,leaseSeconds,expectedTaskId??null]);
   return result.rows[0]||null;
   });
  },
  async finish({scope,role,credential,taskId,leaseId,outcome,evidenceSha256,fixtureProposal}){
   const params=checkScope(scope);getRole(role);const worker=await identity(credential,scope,role,'queue.work');
   if(!['succeeded','failed'].includes(outcome)||typeof taskId!=='string'||typeof leaseId!=='string')throw Error('Invalid completion');
   if(evidenceSha256!==undefined&&(outcome!=='succeeded'||typeof evidenceSha256!=='string'||!/^[a-f0-9]{64}$/.test(evidenceSha256)))throw Error('Invalid evidence digest');
   let fixtureBody;
   if(fixtureProposal!==undefined){
    if(fixtureProposalStorage!==true||outcome!=='succeeded'||fixtureProposal.role!==role||fixtureProposal.approval!==false)throw Error('Fixture storage denied');
    const canonical={role,output:validateProposal(role,fixtureProposal.output),approval:false};
    fixtureBody=JSON.stringify(canonical);
    if(Buffer.byteLength(fixtureBody)>32768||createHash('sha256').update(fixtureBody).digest('hex')!==evidenceSha256)throw Error('Fixture evidence denied');
   }
   return guarded(params,async client=>{
    if(await identity(credential,{product:params[0],repository:params[1],sha:params[2]},role,'queue.work')!==worker)throw Error('Identity denied');
    await assertActive(client,params,role);
   const result=await client.query(`WITH task AS (UPDATE engineering_team_tasks SET state=CASE WHEN $8='failed' AND attempts<2 THEN 'queued' ELSE $8 END,worker_id=NULL,lease_id=NULL,lease_until=NULL WHERE product=$1 AND repository=$2 AND head_sha=$3 AND role=$4 AND worker_id=$5 AND id=$6 AND lease_id=$7 AND state='running' AND lease_until>clock_timestamp() RETURNING id,state), audit AS (INSERT INTO engineering_team_queue_audit(task_id,event) SELECT id,CASE WHEN state='queued' THEN 'retry' ELSE state END FROM task) SELECT state FROM task`,[...params,role,worker,taskId,leaseId,outcome]);
   if(result.rowCount!==1)throw Error('Lease denied');
   if(evidenceSha256!==undefined){
    if(result.rows[0].state!=='succeeded')throw Error('Evidence completion denied');
    await client.query('INSERT INTO engineering_team_proposal_receipts(task_id,lease_id,evidence_sha256) VALUES ($1,$2,$3)',[taskId,leaseId,evidenceSha256]);
   }
   if(fixtureBody!==undefined)await client.query('INSERT INTO engineering_team_fixture_proposals(task_id,body) VALUES ($1,$2)',[taskId,fixtureBody]);
   return result.rows[0].state;
   });
  },
  async expire({scope,credential}){
   const params=checkScope(scope);const actor=await identity(credential,scope,null,'queue.manage');
   return guarded(params,async client=>{
    if(await identity(credential,{product:params[0],repository:params[1],sha:params[2]},null,'queue.manage')!==actor)throw Error('Identity denied');
   const result=await client.query(`WITH candidate AS (SELECT id FROM engineering_team_tasks WHERE product=$1 AND repository=$2 AND head_sha=$3 AND state='running' AND lease_until<=clock_timestamp() ORDER BY lease_until LIMIT 100 FOR UPDATE SKIP LOCKED), task AS (UPDATE engineering_team_tasks t SET state='failed',worker_id=NULL,lease_id=NULL,lease_until=NULL FROM candidate c WHERE t.id=c.id RETURNING t.id), audit AS (INSERT INTO engineering_team_queue_audit(task_id,event) SELECT id,'expired' FROM task) SELECT id FROM task`,params);
   return result.rowCount;
   });
  },
  async cancel({scope,credential,taskId}){
   const params=checkScope(scope);const actor=await identity(credential,scope,null,'queue.manage');
   return guarded(params,async client=>{
    if(await identity(credential,{product:params[0],repository:params[1],sha:params[2]},null,'queue.manage')!==actor)throw Error('Identity denied');
   const result=await client.query(`WITH task AS (UPDATE engineering_team_tasks SET state='cancelled',worker_id=NULL,lease_id=NULL,lease_until=NULL WHERE product=$1 AND repository=$2 AND head_sha=$3 AND id=$4 AND state IN ('queued','running') RETURNING id), audit AS (INSERT INTO engineering_team_queue_audit(task_id,event) SELECT id,'cancelled' FROM task) SELECT id FROM task`,[...params,taskId]);
   return result.rowCount===1;
   });
  }
 });
}
module.exports={createDurableQueue};
