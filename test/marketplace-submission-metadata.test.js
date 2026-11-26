"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,"..","plugin.json"),"utf8"));

test("portable plugin manifest has five complete positive and three complete negative cases",()=>{
 const review=manifest.extensions?.["com.openai"]?.review;
 assert.ok(review);
 assert.equal(review.commerce,false);
 assert.equal(review.test_cases?.positive?.length,5);
 assert.equal(review.test_cases?.negative?.length,3);
 for(const c of review.test_cases.positive){
  assert.equal(typeof c.description,"string");assert.ok(c.description.length>0);
  assert.equal(typeof c.prompt,"string");assert.ok(c.prompt.length>0);
  assert.equal(c.tools_triggered,"aca_get_business_profile");
  assert.equal(typeof c.expected_behavior,"string");assert.ok(c.expected_behavior.length>0);
 }
 for(const c of review.test_cases.negative){
  assert.equal(typeof c.description,"string");assert.ok(c.description.length>0);
  assert.equal(typeof c.prompt,"string");assert.ok(c.prompt.length>0);
  assert.equal(typeof c.expected_behavior,"string");assert.ok(c.expected_behavior.length>0);
 }
});

test("draft manifest contains no fabricated endpoint, legal URL, or reviewer credentials",()=>{
 const text=JSON.stringify(manifest);
 assert.equal(manifest.extensions["com.openai"].interface.websiteURL,"https://www.alphineai.com");
 assert.equal(manifest.extensions["com.openai"].interface.supportURL,"https://www.alphineai.com/contact");
 assert.equal(manifest.extensions["com.openai"].interface.privacyPolicyURL,undefined);
 assert.equal(manifest.extensions["com.openai"].interface.termsOfServiceURL,undefined);
 assert.equal(manifest.extensions["com.openai"].review.demo_recording_url,undefined);
 assert.doesNotMatch(text,/example\.invalid|example\.com|clientSecret|test_credentials|reviewer_instructions/i);
 assert.equal(fs.existsSync(path.join(__dirname,"..","mcp.json")),false);
});
