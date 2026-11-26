"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {generateKeyPairSync,sign}=require("node:crypto");
const {createTrustedReviewProvider}=require("../src/automation/trustedReviewerProvider");
const {verifySignedReview}=require("../src/automation/signedReviewEvidence");
const {evaluatePrSupervision,STATES}=require("../src/automation/prSupervisionPolicy");
const scope={repositoryId:55,issueNumber:20,prNumber:21,headSha:"a".repeat(40),challenge:"c".repeat(64)};
const reviewerId=88,keys=generateKeyPairSync("ed25519");
function signed(status="passed",findings=0,headSha=scope.headSha){
 const issuedAt=Math.floor(Date.now()/1000);
 const record={...scope,headSha,reviewerId,status,findings,issuedAt,expiresAt:issuedAt+120};
 const payload=Buffer.from(JSON.stringify(["aca-review-v2",record.repositoryId,
 record.prNumber,record.headSha,record.reviewerId,record.status,record.findings,record.issueNumber,record.challenge,record.issuedAt,record.expiresAt]));
 return {record,signature:sign(null,payload,keys.privateKey).toString("hex")};
}
const base={issue:{number:20,state:"open",eligible:true},
 pr:{number:21,state:"open",draft:false,headSha:scope.headSha,issueNumber:20},
 trustedHead:true,trustedLink:true,correction:{attempts:0,unchangedFailureCount:0},
 ci:{headSha:scope.headSha,requiredChecks:["Node tests","PostgreSQL ledger integration"].map(name=>({
 name,headSha:scope.headSha,status:"completed",conclusion:"success"}))}};
test("review transport accepts only pinned HTTPS host and valid scope",async()=>{
 for(const endpoint of ["http://reviews.example.test/evidence",
 "https://evil.example.test/evidence","https://user:pass@reviews.example.test/evidence",
 "https://reviews.example.test:8443/evidence","https://reviews.example.test/evidence?token=x",
 "https://reviews.example.test/evidence#fragment"]){
  assert.throws(()=>createTrustedReviewProvider({endpoint,allowedHost:"reviews.example.test",
   transport:async()=>signed()}),/invalid_reviewer_endpoint/);
 }
 const provider=createTrustedReviewProvider({endpoint:"https://reviews.example.test/evidence",
 allowedHost:"reviews.example.test",transport:async(url,request)=>{
  assert.equal(url,"https://reviews.example.test/evidence");
  assert.deepEqual(request,scope);
  return signed();
 }});
 assert.equal((await provider(scope)).record.status,"passed");
 await assert.rejects(provider({...scope,headSha:"bad"}),/invalid_reviewer_scope/);
});
test("end-to-end policy denies forged and stale reviews, never authorizes merge",async()=>{
 const provider=createTrustedReviewProvider({endpoint:"https://reviews.example.test/evidence",
 allowedHost:"reviews.example.test",transport:async()=>signed()});
 const evidence=await provider(scope);
 const verified=verifySignedReview({envelope:evidence,publicKey:keys.publicKey,
 ...scope,reviewerId});
 const ready=evaluatePrSupervision({...base,review:verified});
 assert.equal(ready.state,STATES.READY);
 assert.equal(ready.mergeAuthorized,false);
 assert.equal(ready.deployAuthorized,false);
 const other=generateKeyPairSync("ed25519");
 const forged=verifySignedReview({envelope:evidence,publicKey:other.publicKey,
 ...scope,reviewerId});
 assert.equal(evaluatePrSupervision({...base,review:forged}).state,STATES.REVIEW_PENDING);
 const stale=verifySignedReview({envelope:signed("passed",0,"b".repeat(40)),
 publicKey:keys.publicKey,...scope,reviewerId});
 assert.equal(evaluatePrSupervision({...base,review:stale}).state,STATES.REVIEW_PENDING);
 assert.equal(evaluatePrSupervision({...base,ci:{...base.ci,requiredChecks:[]},review:verified}).state,STATES.CI_PENDING);
 assert.equal(evaluatePrSupervision({...base,correction:null,review:verified}).state,STATES.BLOCKED);
});
