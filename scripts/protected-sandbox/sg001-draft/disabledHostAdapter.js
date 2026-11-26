'use strict';
// Disabled host-side admission and teardown adapter. No OS, network, Docker or
// workflow integration. Evidence provider is an external trust boundary, not a
// caller-supplied proof of authority. Even successful preflight cannot execute.
const {createHash}=require('node:crypto');
const SOURCE='37f9a5327e99f78c3e6208cfba9aaf87c1c15aad';
const PARENT='50c0f44004d7359a60b0c4c080ec5604b7479338';
const HARNESS='edea7595d7f1ea53f2c9657bea0bc936bd5eff64';
const IMAGE='node@sha256:be979e5523c76fa4d5ca4ebd3099078f220aa47ec39c48ad5b5df9314debd6eb';
const REPO='alphineaiinc/aca-realtime-gateway-clean';
const HEX64=/^[a-f0-9]{64}$/;
const HEX40=/^[a-f0-9]{40}$/;
const NUM=/^[1-9][0-9]{0,19}$/;
const ID=/^[A-Za-z0-9._:-]{1,128}$/;
const fail=reason=>Object.freeze({status:'denied',reason,executionAuthorized:false,cleanupAuthorized:false,releaseAuthorized:false,attestation:false});
const result=(status,extra)=>Object.freeze({status,...extra,executionAuthorized:false,cleanupAuthorized:false,releaseAuthorized:false,attestation:false});
const matches=(v,r)=>typeof v==='string'&&r.test(v);
const time=v=>Number.isSafeInteger(v)&&v>0;
const exact=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const controls=Object.freeze({uid:65534,network:'none',readOnly:true,capDrop:'ALL',noNewPrivileges:true,seccomp:true,pids:32,memoryMiB:128,swapTotalMiB:128,cpus:0.5,tmpfsMiB:8});
const permissions=Object.freeze({repositoryWrite:false,oidc:false,secrets:false,productionData:false,productionManagement:false,productionNetwork:false,fixtureHostSocket:false,candidateCheckout:false,dedicatedRunner:true});
function scopeOf(s){
 if(!s||s.repository!==REPO||s.sourceSha!==SOURCE||s.parentSha!==PARENT||s.harnessBlob!==HARNESS||s.image!==IMAGE||s.platform!=='linux/amd64'||!matches(s.adapterSha,HEX40)||!matches(s.platformManifest,HEX64)||!matches(s.localImageId,HEX64)||!matches(s.publisherEvidence,HEX64)||!matches(s.runnerIdentity,HEX64)||!matches(s.runId,NUM)||!matches(s.attempt,NUM)||!matches(s.nonce,/^[a-f0-9]{32}$/)||!matches(s.actor,ID)||!matches(s.observer,ID)||s.actor===s.observer||!time(s.start)||!time(s.end)||!time(s.cleanupDeadline)||s.end<=s.start||s.end-s.start>900000||s.cleanupDeadline<=s.end||s.cleanupDeadline-s.end>900000||s.cleanupDeadline-s.start>3600000)return null;
 const fields=[REPO,SOURCE,PARENT,HARNESS,IMAGE,s.platform,s.adapterSha,s.platformManifest,s.localImageId,s.publisherEvidence,s.runnerIdentity,s.runId,s.attempt,s.nonce,s.actor,s.observer,s.start,s.end,s.cleanupDeadline];
 return Object.freeze({binding:createHash('sha256').update(JSON.stringify(['sg001-disabled-host-v1',...fields])).digest('hex'),...Object.fromEntries(['adapterSha','platformManifest','localImageId','publisherEvidence','runnerIdentity','runId','attempt','nonce','actor','observer','start','end','cleanupDeadline'].map(k=>[k,s[k]]))});
}
const subset=(actual,required)=>actual&&Object.keys(actual).length===Object.keys(required).length&&Object.entries(required).every(([k,v])=>actual[k]===v);
function validReceipt(e,s,kind,now,limit){
 return e&&e.kind===kind&&e.binding===s.binding&&matches(e.authority,ID)&&time(e.issuedAt)&&time(e.expiresAt)&&e.issuedAt<=now&&now<e.expiresAt&&e.expiresAt<=limit;
}
// Trusted provider must authenticate provenance, owner approvals and effective
// permissions independently. It is deliberately not composed with a real provider.
function createDisabledAdapter({verify,clock=Date.now}={}){
 async function checked(kind,s,limit,authority){
  if(typeof verify!=='function')throw Error('provider unavailable');
  const e=structuredClone(await verify(Object.freeze({kind,binding:s.binding})));
  if(!validReceipt(e,s,kind,clock(),limit)||(authority&&e.authority!==authority))throw Error('receipt denied: '+kind);
  return e;
 }
 async function prepare(input){
  try{
   const s=scopeOf(structuredClone(input));if(!s||clock()<s.start||clock()>=s.end)return fail('scope or execution window denied');
   const receipts=[];
   for(const kind of ['sg001','owner','provenance','permissions','cost','teardown']){
    const e=await checked(kind,s,kind==='teardown'?s.cleanupDeadline:s.end,kind==='owner'||kind==='teardown'?s.actor:undefined);
    receipts.push(e);
   }
   const [sg,owner,provenance,perm,cost,teardown]=receipts;
   if(sg.valid!==true||owner.approved!==true||provenance.publisherVerified!==true||provenance.platformManifest!==s.platformManifest||provenance.localImageId!==s.localImageId||provenance.publisherEvidence!==s.publisherEvidence||provenance.adapterSha!==s.adapterSha||provenance.authority===s.actor||perm.authority===s.actor||perm.runnerIdentity!==s.runnerIdentity||!subset(perm.permissions,permissions)||!subset(perm.controls,controls)||cost.currency!=='CAD'||cost.maximumCents!==0||cost.includedVerified!==true||teardown.observer!==s.observer||teardown.cleanupDeadline!==s.cleanupDeadline||teardown.stop!==true||teardown.cancel!==true||teardown.removeExactOwned!==true||teardown.teardownOnly!==true||teardown.expiresAt!==s.cleanupDeadline)return fail('mandatory evidence denied');
   const now=clock();if(now<s.start||now>=s.end||receipts.some(e=>now>=e.expiresAt))return fail('expired during verification');
   return result('disabled-preflight-matched',{binding:s.binding,resourceName:'alphine-sg001-'+s.binding,controls,permissions});
  }catch{return fail('verification unavailable or invalid');}
 }
 async function cleanup(input){
  try{
   const {scope,record,inspection}=structuredClone(input);
   const s=scopeOf(scope);if(!s||clock()<s.start||clock()>=s.cleanupDeadline)return fail('cleanup window denied');
   const e=await checked('teardown',s,s.cleanupDeadline,s.actor);
   if(e.observer!==s.observer||e.cleanupDeadline!==s.cleanupDeadline||e.expiresAt!==s.cleanupDeadline||e.teardownOnly!==true||e.stop!==true||e.cancel!==true||e.removeExactOwned!==true)return fail('cleanup authority denied');
   const owned=await checked('ownership',s,s.cleanupDeadline,s.observer);
   if(!matches(record?.containerId,HEX64)||record.binding!==s.binding||owned.containerId!==record.containerId||owned.runnerIdentity!==s.runnerIdentity||inspection?.id!==record.containerId||inspection?.ownerLabel!==s.binding||inspection?.name!=='/alphine-sg001-'+s.binding||owned.ownerLabel!==s.binding||owned.name!==inspection.name)return fail('ownership unresolved; quarantine');
   const now=clock();if(now>=s.cleanupDeadline||now>=e.expiresAt||now>=owned.expiresAt)return fail('cleanup expired; escalate');
   return result('disabled-teardown-matched',{binding:s.binding,exactContainerId:record.containerId,requiresIndependentAbsenceAndDisposal:true});
  }catch{return fail('cleanup evidence unavailable; quarantine');}
 }
 return Object.freeze({prepare,cleanup});
}
module.exports={createDisabledAdapter,scopeOf,controls,permissions};
