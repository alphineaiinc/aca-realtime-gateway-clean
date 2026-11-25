"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {generateKeyPairSync,sign}=require("node:crypto");
const {validateDisposition}=require("../src/automation/substantiveDisposition");
const keys=generateKeyPairSync("ed25519");
const expected={repositoryId:1,prNumber:2,issueNumber:3,headSha:"a".repeat(40),reviewerId:4,challenge:"b".repeat(64),evidenceSha256:"c".repeat(64)};
const now=1000;
function envelope(overrides={}){
 const record={...expected,status:"passed",findings:0,issuedAt:990,expiresAt:1100,...overrides};
 return {record,signature:sign(null,Buffer.from(JSON.stringify(["aca-substantive-disposition-v1",...Object.values(record)])),keys.privateKey).toString("hex")};
}
const check=(e,opts={})=>validateDisposition({envelope:e,expected,now,publicKey:keys.publicKey,...opts});
test("valid offline disposition never authorizes signing or execution",()=>{
 const r=check(envelope());assert.equal(r.status,"passed");assert.equal(r.signingAuthorized,false);assert.equal(r.executionAuthorized,false);
});
test("reject scope mismatch, stale evidence, inconsistent findings and wrong key",()=>{
 for(const o of [{headSha:"d".repeat(40)},{evidenceSha256:"d".repeat(64)},{challenge:"d".repeat(64)},{issueNumber:9},{reviewerId:9},{expiresAt:1000},{issuedAt:1001},{expiresAt:1200},{findings:1},{status:"findings"}])assert.equal(check(envelope(o)),null);
 assert.equal(check(envelope(),{publicKey:generateKeyPairSync("ed25519").publicKey}),null);
 const e=envelope();e.record.status="blocked";assert.equal(check(e),null);
});
test("authenticated findings remain findings, not clearance",()=>assert.equal(check(envelope({status:"findings",findings:2})).status,"findings"));

test("challenge replay and legacy approval-only envelopes cannot clear disposition",()=>{
 const signed=envelope();
 assert.equal(validateDisposition({envelope:signed,publicKey:keys.publicKey,expected:{...expected,challenge:"d".repeat(64)},now}),null);
 assert.equal(validateDisposition({envelope:{approved:true,reviewerId:expected.reviewerId,headSha:expected.headSha},publicKey:keys.publicKey,expected,now}),null);
});

test("verification boundary rejects private key objects and private PEM",()=>{
 const signed=envelope();
 assert.equal(check(signed,{publicKey:keys.privateKey}),null);
 assert.equal(check(signed,{publicKey:keys.privateKey.export({format:"pem",type:"pkcs8"})}),null);
 assert.equal(check(signed,{publicKey:keys.publicKey.export({format:"pem",type:"spki"})}).status,"passed");
});
