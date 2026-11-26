'use strict';
const {createHash}=require('node:crypto');
const fields=['repositoryId','runId','runAttempt','headSha','workflowBlob','harnessBlob','imageManifest','publisherEvidence','runnerIdentityDigest'];
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const deny=reason=>Object.freeze({reconciled:false,reason,executionAuthorized:false,attestation:false});
// Offline evidence comparison only; authenticated readers must be independently controlled.
async function reconcileTeardown({expected,readRunner,readPublisher,runnerAuthority,publisherAuthority}={}){
 try{
 if(!expected||typeof readRunner!=='function'||typeof readPublisher!=='function'||readRunner===readPublisher||typeof runnerAuthority!=='string'||!runnerAuthority||typeof publisherAuthority!=='string'||!publisherAuthority||runnerAuthority===publisherAuthority)return deny('independent readers required');
 const scope=Object.freeze(Object.fromEntries(fields.map(k=>[k,expected[k]])));
 for(const k of fields){const v=scope[k];if(k==='repositoryId'||k==='runId'||k==='runAttempt'){if(!Number.isSafeInteger(v)||v<1)return deny('invalid scope');}else if(typeof v!=='string'||!( ['headSha','workflowBlob','harnessBlob'].includes(k)?/^[a-f0-9]{40}$/:/^[a-f0-9]{64}$/).test(v))return deny('invalid scope');}
 const runner=await readRunner(scope);
 const publisher=await readPublisher(scope);
 if(!runner||!publisher||runner.authority!==runnerAuthority||publisher.authority!==publisherAuthority||!fields.every(k=>runner[k]===scope[k]&&publisher[k]===scope[k]))return deny('evidence scope mismatch');
 if(runner.lifecycle!=='destroyed'||runner.quarantineCleared!==true||runner.residualCount!==0)return deny('teardown unresolved');
 if(publisher.provenanceVerified!==true||publisher.sourceProtected!==true)return deny('provenance unresolved');
 return Object.freeze({reconciled:false,reason:'matching claims require independent authentication',evidenceDigest:digest([scope,runnerAuthority,publisherAuthority]),executionAuthorized:false,attestation:false});
 }catch{return deny('evidence unavailable');}
}
module.exports={reconcileTeardown};
