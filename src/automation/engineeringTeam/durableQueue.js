'use strict';
const {randomUUID}=require('node:crypto');
const {getRole}=require('./registry');
const scopeKey=s=>JSON.stringify([s.product,s.repository,s.sha]);
const validScope=s=>s&&typeof s.product==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/.test(s.product)&&typeof s.repository==='string'&&/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(s.repository)&&s.repository.length<=200&&typeof s.sha==='string'&&/^[a-f0-9]{40}$/.test(s.sha);
function createDurableQueue({pool,scopes,authenticate,leaseSeconds=60}={}){
 if(!pool||typeof pool.query!=='function'||typeof authenticate!=='function'||!Array.isArray(scopes)||!scopes.length||!scopes.every(validScope)||!Number.isSafeInteger(leaseSeconds)||leaseSeconds<5||leaseSeconds>300)throw Error('Invalid queue configuration');
 const allowed=new Set(scopes.map(scopeKey));
 function checkScope(s){if(!validScope(s)||!allowed.has(scopeKey(s)))throw Error('Scope denied');return [s.product,s.repository,s.sha];}
 async function identity(credential,scope,role,permission){
  const actor=await authenticate(credential);
  if(!actor||typeof actor.id!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/.test(actor.id)||actor.permission!==permission||scopeKey(actor)!==scopeKey(scope)||(role!==null&&actor.role!==role))throw Error('Identity denied');
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
    await client.query('INSERT INTO engineering_team_stops(product,repository,actor_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',[...params.slice(0,2),actor]);
    return true;
   });
  },
  async quarantine({scope,role,credential}){
   const params=checkScope(scope);getRole(role);const actor=await identity(credential,scope,null,'queue.manage');
   return guarded(params,async client=>{
    await client.query('INSERT INTO engineering_team_quarantine(product,repository,role,actor_id) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',[...params.slice(0,2),role,actor]);
    return true;
   });
  },
  async enqueue({scope,role,credential}){
   const params=checkScope(scope);getRole(role);await identity(credential,scope,null,'queue.manage');
   return guarded(params,async client=>{
    await assertActive(client,params,role);
   const id=randomUUID();
   const result=await client.query(`WITH task AS (INSERT INTO engineering_team_tasks(id,product,repository,head_sha,role) VALUES ($1,$2,$3,$4,$5) RETURNING id), audit AS (INSERT INTO engineering_team_queue_audit(task_id,event) SELECT id,'queued' FROM task) SELECT id FROM task`,[id,...params,role]);
   if(result.rowCount!==1)throw Error('Queue insert failed');return id;
   });
  },
  async claim({scope,role,credential}){
   const params=checkScope(scope);getRole(role);const worker=await identity(credential,scope,role,'queue.work');const lease=randomUUID();
   return guarded(params,async client=>{
    await assertActive(client,params,role);
   const result=await client.query(`WITH candidate AS (SELECT id FROM engineering_team_tasks WHERE product=$1 AND repository=$2 AND head_sha=$3 AND role=$4 AND state='queued' AND attempts<2 ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED), task AS (UPDATE engineering_team_tasks t SET state='running',attempts=attempts+1,worker_id=$5,lease_id=$6,lease_until=clock_timestamp()+make_interval(secs=>$7) FROM candidate c WHERE t.id=c.id RETURNING t.id,t.lease_id,t.attempts,t.lease_until), audit AS (INSERT INTO engineering_team_queue_audit(task_id,event) SELECT id,'claimed' FROM task) SELECT * FROM task`,[...params,role,worker,lease,leaseSeconds]);
   return result.rows[0]||null;
   });
  },
  async finish({scope,role,credential,taskId,leaseId,outcome}){
   const params=checkScope(scope);getRole(role);const worker=await identity(credential,scope,role,'queue.work');
   if(!['succeeded','failed'].includes(outcome)||typeof taskId!=='string'||typeof leaseId!=='string')throw Error('Invalid completion');
   return guarded(params,async client=>{
    await assertActive(client,params,role);
   const result=await client.query(`WITH task AS (UPDATE engineering_team_tasks SET state=CASE WHEN $8='failed' AND attempts<2 THEN 'queued' ELSE $8 END,worker_id=NULL,lease_id=NULL,lease_until=NULL WHERE product=$1 AND repository=$2 AND head_sha=$3 AND role=$4 AND worker_id=$5 AND id=$6 AND lease_id=$7 AND state='running' AND lease_until>clock_timestamp() RETURNING id,state), audit AS (INSERT INTO engineering_team_queue_audit(task_id,event) SELECT id,CASE WHEN state='queued' THEN 'retry' ELSE state END FROM task) SELECT state FROM task`,[...params,role,worker,taskId,leaseId,outcome]);
   if(result.rowCount!==1)throw Error('Lease denied');return result.rows[0].state;
   });
  },
  async expire({scope,credential}){
   const params=checkScope(scope);await identity(credential,scope,null,'queue.manage');
   const result=await pool.query(`WITH candidate AS (SELECT id FROM engineering_team_tasks WHERE product=$1 AND repository=$2 AND head_sha=$3 AND state='running' AND lease_until<=clock_timestamp() ORDER BY lease_until LIMIT 100 FOR UPDATE SKIP LOCKED), task AS (UPDATE engineering_team_tasks t SET state='failed',worker_id=NULL,lease_id=NULL,lease_until=NULL FROM candidate c WHERE t.id=c.id RETURNING t.id), audit AS (INSERT INTO engineering_team_queue_audit(task_id,event) SELECT id,'expired' FROM task) SELECT id FROM task`,params);
   return result.rowCount;
  },
  async cancel({scope,credential,taskId}){
   const params=checkScope(scope);await identity(credential,scope,null,'queue.manage');
   const result=await pool.query(`WITH task AS (UPDATE engineering_team_tasks SET state='cancelled',worker_id=NULL,lease_id=NULL,lease_until=NULL WHERE product=$1 AND repository=$2 AND head_sha=$3 AND id=$4 AND state IN ('queued','running') RETURNING id), audit AS (INSERT INTO engineering_team_queue_audit(task_id,event) SELECT id,'cancelled' FROM task) SELECT id FROM task`,[...params,taskId]);
   return result.rowCount===1;
  }
 });
}
module.exports={createDurableQueue};
