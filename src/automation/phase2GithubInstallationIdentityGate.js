"use strict";
/**
 * Separates connector identity, security reviewer identity and CI check issuer.
 * No self-reported connector installation may substitute for pinned reviewer.
 */
const positive=x=>Number.isSafeInteger(x)&&x>0;
const denied=(reason)=>Object.freeze({status:"no_go",reason,
 reviewerIdentityVerified:false,operationalActivationAuthorized:false,
 agentDispatchAuthorized:false,dispatched:false,mergeAuthorized:false,
 deployAuthorized:false,signingAuthorized:false,productionAuthorization:false});
function assessGithubInstallationIdentity(input={}){
 const x=input&&typeof input==="object"&&!Array.isArray(input)?input:{};
 const {expectedRepositoryId,expectedReviewerAppId,expectedReviewerInstallationId,
  observedRepositoryId,observedConnectorInstallationId,observedReviewerAppId,
  observedReviewerInstallationId,observedCiIssuerAppId,expectedCiIssuerAppId,
  reviewerIdentitySource}=x;
 if(![expectedRepositoryId,expectedReviewerAppId,expectedReviewerInstallationId,
 expectedCiIssuerAppId].every(positive))return denied("missing_independently_pinned_ids");
 if(!positive(observedRepositoryId)||observedRepositoryId!==expectedRepositoryId)
  return denied("repository_identity_mismatch");
 if(!positive(observedConnectorInstallationId))
  return denied("connector_installation_not_authenticated");
 if(!positive(observedReviewerAppId)||!positive(observedReviewerInstallationId)||
  observedReviewerAppId!==expectedReviewerAppId||
  observedReviewerInstallationId!==expectedReviewerInstallationId)
  return denied("reviewer_app_installation_unverified");
 if(reviewerIdentitySource!=="authenticated_github_app_endpoint")
  return denied("reviewer_identity_source_untrusted");
 if(!positive(observedCiIssuerAppId)||observedCiIssuerAppId!==expectedCiIssuerAppId)
  return denied("ci_check_issuer_unverified");
 // Identity matches are only claims until the independent transport and key custody
 // are audited. Never issue operational authorization here.
 return Object.freeze({...denied("independent_reviewer_custody_and_live_provenance_required"),
  observedIdentityMatches:true});
}
module.exports={assessGithubInstallationIdentity};
