'use strict';
// Offline policy only. Never grants execution or attestation authority.
// Inputs must be collected independently of the candidate runner.
function assessRuntimeEvidence({expected,evidence}={}){
 const deny=reason=>Object.freeze({accepted:false,reason,executionAuthorized:false,attestation:false});
 if(!expected||!evidence)return deny('missing evidence');
 const hashes=['headSha','workflowBlob','harnessBlob','imageManifest','publisherEvidence','runnerIdentityDigest'];
 for(const key of hashes){
  const pattern=['headSha','workflowBlob','harnessBlob'].includes(key)?/^[a-f0-9]{40}$/:/^[a-f0-9]{64}$/;
  if(typeof expected[key]!=='string'||!pattern.test(expected[key])||evidence[key]!==expected[key])return deny('scope mismatch: '+key);
 }
 for(const key of ['repositoryId','runId','runAttempt']){
  if(!Number.isSafeInteger(expected[key])||expected[key]<1||evidence[key]!==expected[key])return deny('scope mismatch: '+key);
 }
 if(evidence.cleanupDisposition!=='runner-destroyed'||evidence.quarantineCleared!==true)return deny('teardown unresolved');
 const faults=['ambiguousCreate','ambiguousRemoval','residualContainer','wholeJobCancellation','daemonUnavailable'];
 if(!faults.every(key=>evidence.faults?.[key]==='denied-and-reconciled'))return deny('fault evidence incomplete');
 // Matching claims alone are not authenticated evidence.
 return deny('independent authentication and acceptance required');
}

/** Offline integration. Status provider and trust pins must originate outside candidate control. */
async function assessAuthenticatedRuntimeEvidence({expected,evidence,challenge,runner,publisher,trust,keyStatus}={}){
 const deny=reason=>Object.freeze({accepted:false,authenticated:false,reason,executionAuthorized:false,attestation:false});
 try{
 const baseline=assessRuntimeEvidence({expected,evidence});
 if(baseline.reason!=='independent authentication and acceptance required')return deny(baseline.reason);
 if(typeof keyStatus!=='function')return deny('key status unavailable');
 const {verifyTeardownEvidence}=require('./authenticatedTeardownEvidence');
 const scope=Object.freeze({...expected});
 const pins=Object.freeze(Object.fromEntries(['runner','publisher'].map(role=>[role,Object.freeze({...trust[role]})])));
 const input={expected:scope,challenge,runner:structuredClone(runner),publisher:structuredClone(publisher),trust:pins};
 const initial=verifyTeardownEvidence(input);
 if(!initial.authenticated)return deny(initial.reason);
 for(const role of ['runner','publisher']){
 const pin=pins[role];
 if(await keyStatus(Object.freeze({role,authority:pin.authority,fingerprint:pin.fingerprint}))!=='active')return deny('key inactive or unavailable');
 }
 const final=verifyTeardownEvidence(input);
 if(!final.authenticated||final.evidenceDigest!==initial.evidenceDigest)return deny('evidence expired or changed');
 return Object.freeze({accepted:false,authenticated:true,reason:'independent operational acceptance required',evidenceDigest:final.evidenceDigest,executionAuthorized:false,attestation:false});
 }catch{return deny('verification unavailable');}
}
module.exports={assessRuntimeEvidence,assessAuthenticatedRuntimeEvidence};
