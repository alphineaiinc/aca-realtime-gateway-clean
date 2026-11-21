"use strict";
/** Advisory-only gate. A valid signature cannot attest separation of duties. */
const FLAGS=Object.freeze({agentDispatchAuthorized:false,dispatched:false,mergeAuthorized:false,
 deployAuthorized:false,signingAuthorized:false,productionAuthorization:false});
function assessReviewerProvenance({signedReview,githubEvidence,independentAttestation}={}){
 const checks={
  signatureVerified:!!signedReview&&signedReview.source==="trusted_review"&&
   ["passed","findings","blocked","pending"].includes(signedReview.status)&&
   /^[a-f0-9]{40}$/.test(signedReview.headSha||""),
  githubProvenanceVerified:githubEvidence?.verified===true&&
   githubEvidence?.headSha===signedReview?.headSha&&
   Number.isSafeInteger(githubEvidence?.repositoryId)&&githubEvidence.repositoryId>0,
  independentCustodyVerified:independentAttestation?.verified===true&&
   independentAttestation?.independentReviewer===true&&
   independentAttestation?.keyCustodyReviewed===true&&
   independentAttestation?.repositoryId===githubEvidence?.repositoryId&&
   independentAttestation?.headSha===signedReview?.headSha
 };
 const missing=Object.keys(checks).filter(k=>!checks[k]);
 return Object.freeze({status:missing.length?"no_go":"offline_claims_complete",
  externallyAuthenticated:false,operationalActivationAuthorized:false,
  missing:Object.freeze(missing),...FLAGS});
}
module.exports={assessReviewerProvenance};
