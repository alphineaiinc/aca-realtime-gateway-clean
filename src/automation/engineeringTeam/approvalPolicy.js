'use strict';
const {createHash,randomUUID}=require('node:crypto');
const operations=Object.freeze(['provider.activate','github.write','agent.dispatch','merge','deploy','sign','secret.change','database.write','queue.recover']);
const validScope=s=>s&&typeof s.product==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/.test(s.product)&&typeof s.repository==='string'&&/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(s.repository)&&s.repository.length<=200&&typeof s.sha==='string'&&/^[a-f0-9]{40}$/.test(s.sha);
function createApprovalPolicy({authenticate,clock=Date.now,ttlMs=900000}={}){
 if(typeof authenticate!=='function'||typeof clock!=='function'||!Number.isSafeInteger(ttlMs)||ttlMs<1000||ttlMs>900000)throw Error('Invalid approval configuration');
 const pending=new Map();
 const digest=(scope,operation,evidence)=>createHash('sha256').update(JSON.stringify([scope.product,scope.repository,scope.sha,operation,evidence])).digest('hex');
 function request({scope,operation,evidence}){
  if(!validScope(scope)||!operations.includes(operation)||typeof evidence!=='string'||!/^[a-f0-9]{64}$/.test(evidence)||pending.size>=64)throw Error('Approval request denied');
  const id=randomUUID(),binding=digest(scope,operation,evidence),expiresAt=clock()+ttlMs;
  pending.set(id,{binding,expiresAt,state:'pending',scope:Object.freeze({...scope}),operation});
  return Object.freeze({id,binding,expiresAt,state:'pending'});
 }
 async function recordDecision({id,credential,binding,decision}){
  const actor=await authenticate(credential);
  const p=pending.get(id);
  if(!p||p.state!=='pending'||clock()>=p.expiresAt||binding!==p.binding||!['approved','denied'].includes(decision)||actor?.permission!=='owner.approval'||actor?.product!==p.scope.product||actor?.repository!==p.scope.repository||typeof actor.id!=='string'||!actor.id||actor.role!==undefined)throw Error('Decision denied');
  p.state=decision;
  return Object.freeze({id,state:p.state,executionAuthorized:false});
 }
 // Offline foundation: even a valid owner decision cannot activate a live action.
 function executionAllowed(){return false;}
 return Object.freeze({request,recordDecision,executionAllowed});
}
module.exports={createApprovalPolicy,operations};
