"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {generateKeyPairSync,sign}=require("node:crypto");
const {verifySignedReview}=require("../src/automation/signedReviewEvidence");
const keys=generateKeyPairSync("ed25519");
const other=generateKeyPairSync("ed25519");
const scope={repositoryId:98765,prNumber:21,headSha:"a".repeat(40),reviewerId:456};
const record={...scope,status:"passed",findings:0};
function envelope(value=record,key=keys.privateKey){
 const bytes=Buffer.from(JSON.stringify(["aca-review-v1",value.repositoryId,value.prNumber,
 value.headSha,value.reviewerId,value.status,value.findings]));
 return {record:value,signature:sign(null,bytes,key).toString("hex")};
}
test("signed review verifies only pinned Ed25519 signer and exact scope",()=>{
 assert.equal(verifySignedReview({envelope:envelope(),publicKey:keys.publicKey,...scope}).status,"passed");
 assert.equal(verifySignedReview({envelope:envelope(record,other.privateKey),publicKey:keys.publicKey,...scope}),null);
 assert.equal(verifySignedReview({envelope:envelope(),publicKey:other.publicKey,...scope}),null);
 for(const changed of [{prNumber:22},{repositoryId:999},{headSha:"b".repeat(40)},{reviewerId:999}]){
   assert.equal(verifySignedReview({envelope:envelope(),publicKey:keys.publicKey,...scope,...changed}),null);
 }
});
test("signed review rejects tampering, extra fields, malformed signatures and invalid verdicts",()=>{
 assert.equal(verifySignedReview({envelope:{...envelope(),record:{...record,findings:1}},publicKey:keys.publicKey,...scope}),null);
 assert.equal(verifySignedReview({envelope:envelope({...record,extra:true}),publicKey:keys.publicKey,...scope}),null);
 assert.equal(verifySignedReview({envelope:{...envelope(),signature:"abc"},publicKey:keys.publicKey,...scope}),null);
 assert.equal(verifySignedReview({envelope:envelope({...record,findings:1}),publicKey:keys.publicKey,...scope}),null);
 assert.equal(verifySignedReview({envelope:envelope({...record,status:"findings",findings:0}),publicKey:keys.publicKey,...scope}),null);
});
