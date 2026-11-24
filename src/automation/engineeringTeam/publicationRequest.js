'use strict';
const {digest}=require('./patchPlanner');
// Publication request is evidence only. No GitHub client or write capability.
function preparePublicationRequest({plan,verification,review}={}){
 if(!plan||!Array.isArray(plan.changes)||plan.executionAuthorized!==false||plan.evidenceSha256!==digest(JSON.stringify({scope:plan.scope,role:plan.role,changes:plan.changes})))throw Error('Invalid patch');
 if(!verification||verification.evidenceSha256!==plan.evidenceSha256||verification.provenance!=='unverified-runner-report'||!Array.isArray(verification.checks)||!verification.checks.length||verification.checks.some(c=>c.status!=='passed'))throw Error('Invalid test evidence');
 if(!review||review.evidenceSha256!==plan.evidenceSha256||review.role!=='security-reviewer'||review.disposition!=='recommend-review')throw Error('Review evidence required');
 const request={scope:plan.scope,operation:'github.write',mode:'draft-only',patchDigest:plan.evidenceSha256,testDigest:digest(JSON.stringify(verification)),reviewDigest:digest(JSON.stringify(review))};
 return Object.freeze({...request,evidenceSha256:digest(JSON.stringify(request)),executionAuthorized:false,requiresIndependentAcceptance:true});
}
module.exports={preparePublicationRequest};
