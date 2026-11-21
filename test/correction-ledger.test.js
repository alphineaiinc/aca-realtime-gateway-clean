"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {evaluateCorrection} = require("../src/automation/correctionLedger");
const A="a".repeat(40), B="b".repeat(40);
const fingerprint="ci:node-tests:failure";
test("first failure can request a manual correction",()=>{
  const r=evaluateCorrection({attempts:0,headSha:A,failureFingerprint:fingerprint});
  assert.equal(r.allowed,true); assert.equal(r.remaining,2);
});
test("new failure after a changed head has one remaining attempt",()=>{
  const r=evaluateCorrection({attempts:1,previousHeadSha:A,headSha:B,
    previousFailureFingerprint:fingerprint,failureFingerprint:"review:security:failure"});
  assert.equal(r.allowed,true); assert.equal(r.remaining,1);
});
test("identical failure escalates even if SHA changed",()=>{
  assert.equal(evaluateCorrection({attempts:1,previousHeadSha:A,headSha:B,
    previousFailureFingerprint:fingerprint,failureFingerprint:fingerprint}).reason,"unchanged_failure");
});
test("same head cannot consume another correction",()=>{
  assert.equal(evaluateCorrection({attempts:1,previousHeadSha:A,headSha:A,
    previousFailureFingerprint:"old:failure",failureFingerprint:fingerprint}).allowed,false);
});
test("two attempts exhaust budget across rebases",()=>{
  assert.equal(evaluateCorrection({attempts:2,headSha:B,failureFingerprint:fingerprint}).reason,
    "correction_budget_exhausted");
});
test("missing or malformed ledger fails closed",()=>{
  assert.equal(evaluateCorrection({attempts:-1,headSha:A,failureFingerprint:fingerprint}).allowed,false);
  assert.equal(evaluateCorrection({attempts:0,headSha:"short",failureFingerprint:fingerprint}).allowed,false);
});
