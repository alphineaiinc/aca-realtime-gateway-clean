"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {generateKeyPairSync}=require("node:crypto");
const {matchingReview,signVerdict,equalBearer}=require("../src/automation/reviewerStagingServer");
const {verifySignedReview}=require("../src/automation/signedReviewEvidence");
const head="a".repeat(40),scope={repositoryId:9001,prNumber:21,issueNumber:20,headSha:head,challenge:"c".repeat(64)};
const pr={number:21,state:"open",user:{id:111},head:{sha:head,repo:{id:9001}},base:{repo:{id:9001}}};
const review={id:5,user:{id:222},state:"APPROVED",commit_id:head,submitted_at:"2026-11-20T18:00:00Z"};
test("independent approval of exact PR head is required",()=>{
 assert.equal(matchingReview({pr,reviews:[review],scope,reviewerId:222}),true);
 assert.equal(matchingReview({pr,reviews:[review],scope,reviewerId:111}),false);
 assert.equal(matchingReview({pr,reviews:[{...review,commit_id:"b".repeat(40)}],scope,reviewerId:222}),false);
 assert.equal(matchingReview({pr,reviews:[{...review,user:{id:333}}],scope,reviewerId:222}),false);
 assert.equal(matchingReview({pr:{...pr,head:{...pr.head,sha:"b".repeat(40)}},reviews:[review],scope,reviewerId:222}),false);
 assert.equal(matchingReview({pr:{...pr,base:{repo:{id:9002}}},reviews:[review],scope,reviewerId:222}),false);
 assert.equal(matchingReview({pr,reviews:[review,{...review,id:7,state:"CHANGES_REQUESTED",submitted_at:"2026-11-20T19:00:00Z"}],scope,reviewerId:222}),false);
 assert.equal(matchingReview({pr,reviews:Array(100).fill(review),scope,reviewerId:222}),false);
});
test("signs scope compatible with pinned Ed25519 verification",()=>{
 const keys=generateKeyPairSync("ed25519");
 const pem=keys.privateKey.export({type:"pkcs8",format:"pem"});
 const envelope=signVerdict(scope,222,pem);
 const verified=verifySignedReview({envelope,publicKey:keys.publicKey,
 ...scope,headSha:head,reviewerId:222});
 assert.equal(verified.status,"passed");
 assert.equal(verifySignedReview({envelope,publicKey:keys.publicKey,
 ...scope,headSha:"b".repeat(40),reviewerId:222}),null);
});
test("endpoint authorization rejects absent and wrong bearer tokens",()=>{
 assert.equal(equalBearer("Bearer local-staging-secret","local-staging-secret"),true);
 for(const header of [null,"Bearer wrong","local-staging-secret","Bearer ","Bearer local-staging-secret-extra"])
   assert.equal(equalBearer(header,"local-staging-secret"),false);
 assert.equal(equalBearer("Bearer abc",""),false);
});
