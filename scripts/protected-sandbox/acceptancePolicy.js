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
module.exports={assessRuntimeEvidence};
