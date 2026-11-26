'use strict';
const {createHash}=require('node:crypto');
const {evaluatePilotPreparation}=require('./restrictedPilotPreparation');
// Host-only adapter contract: transact must serialize by runId, atomically
// persist records and expose authoritative evidence within the same transaction.
// No runtime registration or execution capability. A receipt is not admission.
const DOMAIN='sg001-pilot-preparation-record-v1';
// Deterministic JSON encoding for JSON-compatible evidence, independent of JSONB key order.
function canonicalJson(x){
 if(x===null||typeof x==='string'||typeof x==='boolean'||(typeof x==='number'&&Number.isFinite(x)))return JSON.stringify(x);
 if(Array.isArray(x))return '['+x.map(canonicalJson).join(',')+']';
 if(x&&typeof x==='object')return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonicalJson(x[k])).join(',')+'}';
 throw Error('Non-JSON evidence');
}
const digest=x=>createHash('sha256').update(canonicalJson(x)).digest('hex');
const current=(e,now)=>Number.isSafeInteger(e?.expiresAt)&&e.expiresAt>now;
const denied=()=>Object.freeze({domain:DOMAIN,status:'denied',executionAuthorized:false,releaseAuthorized:false});
function createPilotPreparationRecorder({store,authenticateOwner,readEvidence,clock=Date.now}={}){
 if(typeof store?.transact!=='function'||typeof authenticateOwner!=='function'||typeof readEvidence!=='function'||typeof clock!=='function')throw Error('Trusted preparation adapters required');
 async function record({scope,credential}={}){
 try{
 const snapshot=JSON.parse(JSON.stringify(scope));
 if(typeof snapshot?.runId!=='string'||! /^[A-Za-z0-9_-]{1,80}$/.test(snapshot.runId))return denied();
 return await store.transact(snapshot.runId,async tx=>{
 if(await tx.read()!==null)return denied();
 const first=await readEvidence(tx,snapshot);
 const result=evaluatePilotPreparation({scope:snapshot,approval:first?.approval,evidence:first?.evidence,now:clock()});
 if(!current(first,clock())||result.status!=='preparation-consistent')return denied();
 const binding=digest([DOMAIN,result.binding,first.approval,first.evidence,first.expiresAt]);
 const owner=await authenticateOwner(credential,binding,tx);
 const valid=o=>o?.permission==='owner.approval'&&o.product===snapshot.project&&o.repository===snapshot.repository&&o.sha===snapshot.sourceSha&&o.binding===binding&&typeof o.id==='string'&&o.id.length>0;
 if(!valid(owner))return denied();
 const fresh=await readEvidence(tx,snapshot);
 if(digest([DOMAIN,result.binding,fresh?.approval,fresh?.evidence,fresh?.expiresAt])!==binding)return denied();
 const again=await authenticateOwner(credential,binding,tx);
 if(!current(fresh,clock())||!valid(again)||again.id!==owner.id||evaluatePilotPreparation({scope:snapshot,approval:fresh.approval,evidence:fresh.evidence,now:clock()}).status!=='preparation-consistent')return denied();
 const receipt=Object.freeze({domain:DOMAIN,status:'recorded-preparation',runId:snapshot.runId,binding,ownerId:owner.id,cleanup:Object.freeze({...fresh.approval.cleanup,actions:Object.freeze([...fresh.approval.cleanup.actions])}),runEnd:fresh.approval.end,executionAuthorized:false,releaseAuthorized:false});
 if(!current(fresh,clock()))return denied();
 if(await tx.insert(receipt)!==true)throw Error('Record insert failed');
 return receipt;
 });
 }catch{return denied();}
 }
 return Object.freeze({record,executionAllowed:()=>false});
}
module.exports={createPilotPreparationRecorder,canonicalJson};
