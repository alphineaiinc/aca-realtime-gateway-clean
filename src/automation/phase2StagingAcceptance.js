"use strict";
/** Pure evidence-only Phase 2 staging gate. Never grants operational authority. */
const GATES=Object.freeze([
 "isolatedDatabaseRoles","repositoryRlsVerified","stagingMigrationsVerified",
 "githubProvenanceVerified","independentReviewerVerified","reviewerKeyRotationVerified",
 "ownerOAuthBrowserVerified","privateServiceVerified","realMtlsVerified",
 "nonceReplayVerified","adversarialRollbackVerified"
]);
const FLAGS=Object.freeze({agentDispatchAuthorized:false,dispatched:false,
 mergeAuthorized:false,deployAuthorized:false,signingAuthorized:false,
 productionAuthorization:false});
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
function evaluateStagingAcceptance(evidence={}){
 const obj=evidence&&typeof evidence==="object"&&!Array.isArray(evidence);
 const entries=GATES.map(name=>{
  const item=obj&&own(evidence,name)?evidence[name]:null;
  const accepted=!!(item&&typeof item==="object"&&!Array.isArray(item)&&
   item.verified===true&&item.environment==="isolated-staging"&&
   typeof item.evidenceUrl==="string"&&/^https:\/\/[^\s/?#]+\/[^\s]+$/.test(item.evidenceUrl)&&
   item.reviewedByIndependentParty===true);
  return Object.freeze({gate:name,verified:accepted,
   reason:accepted?"evidence_attested":"missing_or_untrusted_evidence"});
 });
 const missing=entries.filter(x=>!x.verified).map(x=>x.gate);
 return Object.freeze({status:missing.length===0?"offline_evidence_complete":"no_go",
  operationalActivationAuthorized:false,stagingDeploymentAuthorized:false,
  missing:Object.freeze(missing),gates:Object.freeze(entries),...FLAGS});
}
module.exports={GATES,evaluateStagingAcceptance};
