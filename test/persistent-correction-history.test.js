"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {verifyCorrectionHistory:verify}=require("../src/automation/persistentCorrectionHistory");
const A="a".repeat(40),B="b".repeat(40),C="c".repeat(40);
const base={repositoryId:100,issueNumber:20,prNumber:21,headSha:C,authenticatedStore:true,
 ledger:{schemaVersion:1,repositoryId:100,issueNumber:20,prNumber:21,
 attempts:[{sequence:1,headSha:A,failureFingerprint:"ci:failure:first"},
 {sequence:2,headSha:B,failureFingerprint:"ci:failure:second"}],
 currentFailureFingerprint:"ci:failure:second"}};
test("authenticated persisted attempts survive current head changes",()=>{
 assert.deepEqual(verify(base),{attempts:2,unchangedFailureCount:1});
});
test("unauthenticated history fails closed",()=>{
 assert.equal(verify({...base,authenticatedStore:false}),null);
});
test("different issue or PR cannot reuse ledger",()=>{
 assert.equal(verify({...base,issueNumber:19}),null);
 assert.equal(verify({...base,prNumber:22}),null);
 assert.equal(verify({...base,repositoryId:101}),null);
});
test("over budget and missing sequence rejected",()=>{
 const ledger=structuredClone(base.ledger);
 ledger.attempts.push({sequence:3,headSha:C,failureFingerprint:"ci:failure:third"});
 assert.equal(verify({...base,ledger}),null);
 ledger.attempts.pop();ledger.attempts[1].sequence=3;
 assert.equal(verify({...base,ledger}),null);
});
test("duplicate commit and malformed fingerprint rejected",()=>{
 const ledger=structuredClone(base.ledger);
 ledger.attempts[1].headSha=A;
 assert.equal(verify({...base,ledger}),null);
 ledger.attempts[1].headSha=B;ledger.currentFailureFingerprint="bad";
 assert.equal(verify({...base,ledger}),null);
});
test("fresh authenticated ledger reports zero attempts",()=>{
 assert.deepEqual(verify({...base,ledger:{...base.ledger,attempts:[],
 currentFailureFingerprint:null}}),{attempts:0,unchangedFailureCount:0});
});
