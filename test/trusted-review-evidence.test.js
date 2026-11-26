"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {verifyReviewEvidence:verify} = require("../src/automation/trustedReviewEvidence");
const sha="a".repeat(40);
const base={expectedHeadSha:sha,expectedPrNumber:21,trustedReviewerId:42,
 authenticatedActorId:42,record:{prNumber:21,headSha:sha,reviewerId:42,status:"passed",findings:0}};
test("authenticated pinned reviewer with current-head passing evidence accepted",()=>{
 assert.deepEqual(verify(base),{headSha:sha,status:"passed",findings:0,independent:true,source:"trusted_review"});
});
test("untrusted or missing authenticated identity rejected",()=>{
 assert.equal(verify({...base,authenticatedActorId:7}),null);
 assert.equal(verify({...base,trustedReviewerId:undefined}),null);
});
test("stale head and wrong PR rejected",()=>{
 assert.equal(verify({...base,expectedHeadSha:"b".repeat(40)}),null);
 assert.equal(verify({...base,expectedPrNumber:22}),null);
});
test("self-declared reviewer identity is insufficient",()=>{
 assert.equal(verify({...base,record:{...base.record,reviewerId:7}}),null);
});
test("inconsistent verdicts and malformed evidence rejected",()=>{
 assert.equal(verify({...base,record:{...base.record,status:"passed",findings:1}}),null);
 assert.equal(verify({...base,record:{...base.record,status:"findings",findings:0}}),null);
 assert.equal(verify({...base,record:{...base.record,status:"approved"}}),null);
});
test("authenticated findings can be represented without granting approval",()=>{
 const result=verify({...base,record:{...base.record,status:"findings",findings:2}});
 assert.equal(result.status,"findings");assert.equal(result.independent,true);
});
