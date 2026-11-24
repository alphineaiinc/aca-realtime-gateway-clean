'use strict';
const {digest}=require('./patchPlanner');
// Publication request is evidence only. No GitHub client or write capability.
function preparePublicationRequest({plan,verification,review}={}){
 if(!plan||!Array.isArray(plan.changes)||plan.executionAuthorized!==false||plan.evidenceSha256!==digest(JSON.stringify({scope:plan.scope,role:plan.role,changes:plan.changes})))throw Error('Invalid patch');
 if(!verification||verification.evidenceSha256!==plan.evidenceSha256||verification.provenance!=='unverified-runner-report'||!Array.isArray(verification.checks)||!verification.checks.length||verification.checks.some(c=>c.status!=='passed'))throw Error('Invalid test evidence');
 if(!review||review.evidenceSha256!==plan.evidenceSha256||review.role!=='security-reviewer'||review.disposition!=='recommend-review')throw Error('Review evidence required');
 const request={scope:Object.freeze({...plan.scope}),operation:'github.write',mode:'draft-only',patchDigest:plan.evidenceSha256,testDigest:digest(JSON.stringify(verification)),reviewDigest:digest(JSON.stringify(review))};
 return Object.freeze({...request,evidenceSha256:digest(JSON.stringify(request)),executionAuthorized:false,requiresIndependentAcceptance:true});
}
// Snapshot and validate the complete request preimage before any asynchronous work.
function validatePublicationRequest(request,expected={}){
 const s=request?.scope;
 if(!s||Object.keys(s).sort().join(',')!=='product,repository,sha'||typeof s.product!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(s.product)||typeof s.repository!=='string'||!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(s.repository)||typeof s.sha!=='string'||!/^[a-f0-9]{40}$/.test(s.sha)||Object.keys(expected).some(k=>s[k]!==expected[k]))throw Error('Evidence scope denied');
 if(request.operation!=='github.write'||request.mode!=='draft-only'||request.executionAuthorized!==false||request.requiresIndependentAcceptance!==true)throw Error('Evidence policy denied');
 const payload={scope:Object.freeze({product:s.product,repository:s.repository,sha:s.sha}),operation:request.operation,mode:request.mode,patchDigest:request.patchDigest,testDigest:request.testDigest,reviewDigest:request.reviewDigest};
 if([payload.patchDigest,payload.testDigest,payload.reviewDigest].some(x=>typeof x!=='string'||!/^[a-f0-9]{64}$/.test(x))||digest(JSON.stringify(payload))!==request.evidenceSha256)throw Error('Evidence denied');
 return Object.freeze({...payload,evidenceSha256:request.evidenceSha256,executionAuthorized:false,requiresIndependentAcceptance:true});
}
module.exports={preparePublicationRequest,validatePublicationRequest};
