'use strict';
// Offline synthetic contract only. Never a cryptographic verifier or authorization gate.
const fields=['repository','sourceSha','workflow','workflowSha','digest','issuer','predicate','platform','rootDigest'];
const hex40=/^[a-f0-9]{40}$/;
const hex64=/^sha256:[a-f0-9]{64}$/;
function snapshot(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid tuple');
 const result={};
 for(const field of fields){
  const d=Object.getOwnPropertyDescriptor(value,field);
  if(!d||!Object.hasOwn(d,'value')||typeof d.value!=='string'||!d.value.trim()||d.value.length>512)throw Error('Invalid tuple');
  result[field]=d.value;
 }
 if(!hex40.test(result.sourceSha)||!hex40.test(result.workflowSha)||!hex64.test(result.digest)||!hex64.test(result.rootDigest))throw Error('Invalid pin');
 return Object.freeze(result);
}
const result=status=>Object.freeze({status,mode:'synthetic-offline-only',cryptographicallyVerified:false,executionAuthorized:false,releaseApproved:false});
function createOfflineProvenanceContract(expectation,{timeoutMs=1000}={}){
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>5000)throw Error('Invalid fixture deadline');
 const pinned=snapshot(expectation);
 return Object.freeze({async assessFixture(readFixture){
  if(typeof readFixture!=='function')return result('denied');
  const controller=new AbortController();
  let timer;
  try{
   const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{reject(Error('Fixture deadline'));controller.abort();},timeoutMs);});
   const records=await Promise.race([deadline,Promise.resolve().then(()=>readFixture(controller.signal))]);
   if(!Array.isArray(records)||records.length!==1)return result('denied');
   const record=records[0];
   if(!record||record.mode!=='synthetic-fixture'||record.signatureStatus!=='fixture-valid'||record.transparencyStatus!=='fixture-valid'||record.manifestType!=='platform-manifest')return result('denied');
   const actual=snapshot(record);
   return result(fields.every(k=>actual[k]===pinned[k])?'fixture-provenance-match':'denied');
  }catch{return result('denied');}
  finally{clearTimeout(timer);}
 }});
}
module.exports={createOfflineProvenanceContract};
