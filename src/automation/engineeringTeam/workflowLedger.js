'use strict';
const {randomUUID,createHash}=require('node:crypto');
const {validateProposal}=require('./contracts');
const {sequence}=require('./offlineTeam');
// Manager-only receipt handoff. No worker dispatch or proposal body storage.
function createWorkflowLedger({pool,scope,authenticate}={}){
 if(!pool||typeof pool.query!=='function'||typeof pool.connect!=='function'||typeof authenticate!=='function'||!scope||typeof scope.product!=='string'||typeof scope.repository!=='string'||! /^[a-f0-9]{40}$/.test(scope.sha))throw Error('Invalid workflow ledger');
 const pinned=Object.freeze({product:scope.product,repository:scope.repository,sha:scope.sha});
 const params=[pinned.product,pinned.repository,pinned.sha];
 async function auth(credential){
  const a=await authenticate(credential);
  if(!a||a.permission!=='queue.manage'||a.role!==undefined||a.product!==pinned.product||a.repository!==pinned.repository||a.sha!==pinned.sha)throw Error('Workflow identity denied');
 }
 async function guarded(work){
  const client=await pool.connect();let discard=false;
  try{
   await client.query('BEGIN');
   await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(params.slice(0,2))]);
   const result=await work(client);
   await client.query('COMMIT');return result;
  }catch(e){try{await client.query('ROLLBACK');}catch{discard=true;}throw e;}
  finally{client.release(discard);}
 }
 return Object.freeze({
  async create(credential,input={}){
   await auth(credential);
   const hasSubject=Object.hasOwn(input,'subject'),hasRole=Object.hasOwn(input,'developerRole');
   if(hasSubject!==hasRole||(hasSubject&&(typeof input.subject!=='string'||!input.subject.trim()||input.subject.length>2000||!['backend-developer','frontend-developer'].includes(input.developerRole))))throw Error('Workflow input denied');
   const id=randomUUID();
   const result=await pool.query('INSERT INTO engineering_team_workflows(id,product,repository,head_sha,subject,developer_role) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,next_step',[id,...params,hasSubject?input.subject:null,hasRole?input.developerRole:null]);
   return result.rows[0];
  },
  async readInput({credential,id}){
   await auth(credential);
   const result=await pool.query('SELECT subject,developer_role FROM engineering_team_workflows WHERE id=$1 AND product=$2 AND repository=$3 AND head_sha=$4',[id,...params]);
   if(result.rowCount!==1||typeof result.rows[0].subject!=='string'||!['backend-developer','frontend-developer'].includes(result.rows[0].developer_role))throw Error('Workflow input unavailable');
   return Object.freeze({subject:result.rows[0].subject,developerRole:result.rows[0].developer_role});
  },
  async advance({credential,id,step,taskId}){
   await auth(credential);
   if(!Number.isSafeInteger(step)||step<0||step>=sequence.length)throw Error('Invalid workflow step');
   return guarded(async client=>{
   const result=await client.query(`WITH advanced AS (
 UPDATE engineering_team_workflows w SET next_step=next_step+1
 WHERE w.id=$1 AND w.product=$2 AND w.repository=$3 AND w.head_sha=$4 AND w.next_step=$5
 AND EXISTS(SELECT 1 FROM engineering_team_tasks t JOIN engineering_team_proposal_receipts r ON r.task_id=t.id
 WHERE t.id=$6 AND t.product=w.product AND t.repository=w.repository AND t.head_sha=w.head_sha AND t.role=$7 AND t.state='succeeded' AND t.workflow_id=w.id AND t.workflow_step=$5)
 AND NOT EXISTS(SELECT 1 FROM engineering_team_stops s WHERE s.product=w.product AND s.repository=w.repository)
 AND NOT EXISTS(SELECT 1 FROM engineering_team_quarantine q WHERE q.product=w.product AND q.repository=w.repository AND q.role=$7)
 RETURNING w.id,w.next_step
 ), handoff AS (INSERT INTO engineering_team_handoffs(workflow_id,step,task_id) SELECT id,$5,$6 FROM advanced RETURNING workflow_id)
 SELECT id,next_step FROM advanced JOIN handoff ON handoff.workflow_id=advanced.id`,[id,...params,step,taskId,sequence[step]]);
   if(result.rowCount!==1)throw Error('Handoff denied');
   return Object.freeze({...result.rows[0],releaseApproved:false});
   });
  },
  async readFixturePrior({credential,id}){
   await auth(credential);
   const result=await pool.query(`SELECT w.next_step,h.step,t.role,p.body,r.evidence_sha256
 FROM engineering_team_workflows w LEFT JOIN engineering_team_handoffs h ON h.workflow_id=w.id
 LEFT JOIN engineering_team_tasks t ON t.id=h.task_id AND t.workflow_id=w.id AND t.workflow_step=h.step AND t.product=w.product AND t.repository=w.repository AND t.head_sha=w.head_sha AND t.state='succeeded'
 LEFT JOIN engineering_team_proposal_receipts r ON r.task_id=t.id
 LEFT JOIN engineering_team_fixture_proposals p ON p.task_id=t.id
 WHERE w.id=$1 AND w.product=$2 AND w.repository=$3 AND w.head_sha=$4
 AND NOT EXISTS(SELECT 1 FROM engineering_team_stops s WHERE s.product=w.product AND s.repository=w.repository)
 AND NOT EXISTS(SELECT 1 FROM engineering_team_quarantine q WHERE q.product=w.product AND q.repository=w.repository)
 ORDER BY h.step`,[id,...params]);
   if(!result.rowCount)throw Error('Workflow unavailable');
   const count=result.rows[0].next_step;
   if(count===0)return Object.freeze([]);
   if(result.rowCount!==count||count>8)throw Error('Prior evidence incomplete');
   return Object.freeze(result.rows.map((row,i)=>{
    if(row.step!==i||row.role!==sequence[i]||typeof row.body!=='string'||Buffer.byteLength(row.body)>32768||createHash('sha256').update(row.body).digest('hex')!==row.evidence_sha256)throw Error('Prior evidence denied');
    const parsed=JSON.parse(row.body);
    if(parsed.role!==row.role||parsed.approval!==false)throw Error('Prior proposal denied');
    return Object.freeze({role:row.role,output:validateProposal(row.role,parsed.output),approval:false});
   }));
  },
  async status({credential,id}){
   await auth(credential);
   const result=await pool.query('SELECT id,next_step FROM engineering_team_workflows WHERE id=$1 AND product=$2 AND repository=$3 AND head_sha=$4',[id,...params]);
   if(result.rowCount!==1)throw Error('Workflow unavailable');
   return Object.freeze({...result.rows[0],releaseApproved:false});
  }
 });
}
module.exports={createWorkflowLedger};
