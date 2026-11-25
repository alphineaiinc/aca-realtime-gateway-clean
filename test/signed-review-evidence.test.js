"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {generateKeyPairSync,sign}=require("node:crypto");
const {verifySignedReview}=require("../src/automation/signedReviewEvidence");
const keys=generateKeyPairSync("ed25519");
const other=generateKeyPairSync("ed25519");
const scope={repositoryId:98765,prNumber:21,headSha:"a".repeat(40),reviewerId:456,issueNumber:20,challenge:"c".repeat(64)};
const now=Math.floor(Date.now()/1000);
const record={...scope,status:"passed",findings:0,issuedAt:now,expiresAt:now+120};
function envelope(value=record,key=keys.privateKey){
 const bytes=Buffer.from(JSON.stringify(["aca-review-v2",value.repositoryId,value.prNumber,
 value.headSha,value.reviewerId,value.status,value.findings,value.issueNumber,value.challenge,value.issuedAt,value.expiresAt]));
 return {record:value,signature:sign(null,bytes,key).toString("hex")};
}
test("signed review verifies only pinned Ed25519 signer and exact scope",()=>{
 assert.equal(verifySignedReview({envelope:envelope(),publicKey:keys.publicKey,...scope}).status,"passed");
 assert.equal(verifySignedReview({envelope:envelope(record,other.privateKey),publicKey:keys.publicKey,...scope}),null);
 assert.equal(verifySignedReview({envelope:envelope(),publicKey:other.publicKey,...scope}),null);
 for(const changed of [{prNumber:22},{repositoryId:999},{headSha:"b".repeat(40)},{reviewerId:999},{issueNumber:99},{challenge:"d".repeat(64)}]){
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

test("v2 rejects expired future and overlong evidence and legacy signatures",()=>{
 for(const changed of [{issuedAt:now-120,expiresAt:now},{issuedAt:now+60,expiresAt:now+120},{expiresAt:now+121}]){
  assert.equal(verifySignedReview({envelope:envelope({...record,...changed}),publicKey:keys.publicKey,...scope}),null);
 }
 const legacy={repositoryId:scope.repositoryId,prNumber:scope.prNumber,headSha:scope.headSha,reviewerId:scope.reviewerId,status:"passed",findings:0};
 const bytes=Buffer.from(JSON.stringify(["aca-review-v1",legacy.repositoryId,legacy.prNumber,legacy.headSha,legacy.reviewerId,legacy.status,legacy.findings]));
 assert.equal(verifySignedReview({envelope:{record:legacy,signature:sign(null,bytes,keys.privateKey).toString("hex")},publicKey:keys.publicKey,...scope}),null);
});

test("S3-03 verifier rejects private key material and ambiguous key containers",()=>{
 const pem=keys.publicKey.export({type:"spki",format:"pem"});
 assert.equal(verifySignedReview({envelope:envelope(),publicKey:pem,...scope}).status,"passed");
 for(const publicKey of [keys.privateKey,keys.privateKey.export({type:"pkcs8",format:"pem"}),{key:pem},Buffer.from(pem)])assert.equal(verifySignedReview({envelope:envelope(),publicKey,...scope}),null);
 assert.equal(verifySignedReview({envelope:envelope(),publicKey:keys.publicKey,...scope,headSha:[scope.headSha]}),null);
});

test("reject concatenated PEM blocks and trailing material",()=>{
 const pem=keys.publicKey.export({type:"spki",format:"pem"});
 const privatePem=keys.privateKey.export({type:"pkcs8",format:"pem"});
 for(const publicKey of [pem+privatePem,pem+pem,pem+"trailing",pem+"\n"+privatePem])assert.equal(verifySignedReview({envelope:envelope(),publicKey,...scope}),null);
});
