"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {normalizeEmail}=require("../src/security/onboardingChallenge");
test("onboarding accepts one mailbox, not SMTP address lists or display names",()=>{
 for(const value of ["a@example.test,b@example.test","a,b@example.test","a;b@example.test","<a@example.test>","a@example.test\r\nBcc:b@example.test","a@example.test (name)"])assert.throws(()=>normalizeEmail(value));
 assert.equal(normalizeEmail(" Owner+tag@Example.test "),"owner+tag@example.test");
});
