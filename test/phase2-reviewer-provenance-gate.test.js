"use strict";
const {test}=require("node:test");const assert=require("node:assert/strict");
const {assessReviewerProvenance:check}=require("../src/automation/phase2ReviewerProvenanceGate");
const sha="a".repeat(40),repositoryId=880001;
const signedReview={source:"trusted_review",status:"passed",headSha:sha,independent:true};
const githubEvidence={verified:true,headSha:sha,repositoryId};
const independentAttestation={verified:true,independentReviewer:true,keyCustodyReviewed:true,repositoryId,headSha:sha};
function locked(r){assert.equal(r.operationalActivationAuthorized,false);
 assert.equal(r.externallyAuthenticated,false);
 for(const k of ["agentDispatchAuthorized","dispatched","mergeAuthorized","deployAuthorized","signingAuthorized","productionAuthorization"])assert.equal(r[k],false,k);}
test("signature alone, even with claimed independent=true, is no-go",()=>{
 const r=check({signedReview});locked(r);assert.equal(r.status,"no_go");
 assert.ok(r.missing.includes("independentCustodyVerified"));
});
test("head/repository/custody mismatches fail closed",()=>{
 for(const changed of [{githubEvidence:{...githubEvidence,headSha:"b".repeat(40)}},
 {independentAttestation:{...independentAttestation,repositoryId:880002}},
 {independentAttestation:{...independentAttestation,keyCustodyReviewed:false}},
 {independentAttestation:{...independentAttestation,headSha:"b".repeat(40)}},
 {githubEvidence:{...githubEvidence,verified:false}}]){
 const r=check({signedReview,githubEvidence,independentAttestation,...changed});
 locked(r);assert.equal(r.status,"no_go");
 }
});
test("all self-reported claims remain non-operational and unauthenticated",()=>{
 const r=check({signedReview,githubEvidence,independentAttestation});locked(r);
 assert.equal(r.status,"offline_claims_complete");assert.deepEqual(r.missing,[]);
});
test("empty and malformed inputs fail closed",()=>{
 for(const x of [null,{},[],{signedReview:{independent:true}}, {signedReview:{...signedReview,headSha:"not-a-sha"}}]){
 const r=check(x);locked(r);assert.equal(r.status,"no_go");
 }
});
