'use strict';
const {randomUUID}=require('node:crypto');
const {sequence}=require('./offlineTeam');
// Manager-only receipt handoff. No worker dispatch or proposal body storage.
function createWorkflowLedger({pool,scope,authenticate}={}){
 if(!pool||typeof pool.query!=='function'||typeof authenticate!=='function'||!scope||typeof scope.product!=='string'||typeof scope.repository!=='string'||! /^[a-f0-9]{40}$/.test(scope.sha))throw Error('Invalid workflow ledger');
 const pinned=Object.freeze({product:scope.product,repository:scope.repository,sha:scope.sha});
 const params=[pinned.product,pinned.repository,pinned.sha];
 async function auth(credential){
  const a=await authenticate(credential);
  if(!a||a.permission!=='queue.manage'||a.role!==undefined||a.product!==pinned.product||a.repository!==pinned.repository||a.sha!==pinned.sha)throw Error('Workflow identity denied');
 }
 return Object.freeze({
  async create(credential){
   await auth(credential);const id=randomUUID();
   const result=await pool.query('INSERT INTO engineering_team_workflows(id,product,repository,head_sha) VALUES ($1,$2,$3,$4) RETURNING id,next_step',[id,...params]);
   return result.rows[0];
  },
  async advance({credential,id,step,taskId}){
   await auth(credential);
   if(!Number.isSafeInteger(step)||step<0||step>=sequence.length)throw Error('Invalid workflow step');
   const result=await pool.query(`WITH advanced AS (
 UPDATE engineering_team_workflows w SET next_step=next_step+1
 WHERE w.id=$1 AND w.product=$2 AND w.repository=$3 AND w.head_sha=$4 AND w.next_step=$5
 AND EXISTS(SELECT 1 FROM engineering_team_tasks t JOIN engineering_team_proposal_receipts r ON r.task_id=t.id
 WHERE t.id=$6 AND t.product=w.product AND t.repository=w.repository AND t.head_sha=w.head_sha AND t.role=$7 AND t.state='succeeded')
 AND NOT EXISTS(SELECT 1 FROM engineering_team_stops s WHERE s.product=w.product AND s.repository=w.repository)
 RETURNING w.id,w.next_step
 ), handoff AS (INSERT INTO engineering_team_handoffs(workflow_id,step,task_id) SELECT id,$5,$6 FROM advanced RETURNING workflow_id)
 SELECT id,next_step FROM advanced JOIN handoff ON handoff.workflow_id=advanced.id`,[id,...params,step,taskId,sequence[step]]);
   if(result.rowCount!==1)throw Error('Handoff denied');
   return Object.freeze({...result.rows[0],releaseApproved:false});
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
