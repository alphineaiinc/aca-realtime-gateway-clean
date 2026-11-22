"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {generateKeyPairSync}=require("node:crypto");
const {readReviewerGithubAppKey:read,REVIEWER_GITHUB_APP_SECRET_PATH:PATH}=require("../src/automation/reviewerGithubAppSecretFile");
const key=generateKeyPairSync("rsa",{modulusLength:2048}).privateKey.export({type:"pkcs8",format:"pem"});
test("reads only pinned Render secret file",()=>{
 let seen;
 const actual=read({ACA_REVIEW_GITHUB_APP_PRIVATE_KEY_PATH:PATH},{
  readFileSync:(p,options)=>{seen={p,options};return key;}});
 assert.equal(actual,key);assert.equal(seen.p,PATH);
 assert.deepEqual(seen.options,{encoding:"utf8",flag:"r"});
});
test("rejects missing or arbitrary secret paths before reading",()=>{
 let calls=0;const loader=()=>{calls++;return key;};
 for(const env of [{},{ACA_REVIEW_GITHUB_APP_PRIVATE_KEY_PATH:"/tmp/key.pem"},
  {ACA_REVIEW_GITHUB_APP_PRIVATE_KEY_PATH:"/etc/secrets/../other.pem"},null]){
 assert.throws(()=>read(env,{readFileSync:loader}),/not_configured/);
 }
 assert.equal(calls,0);
});
test("rejects missing, malformed, empty and oversized keys without echoing secrets",()=>{
 for(const candidate of ["", "bad-secret","-----BEGIN PUBLIC KEY-----\n"+("A".repeat(128))+"\n-----END PUBLIC KEY-----",
  key+"A".repeat(17000)]){
 assert.throws(()=>read({ACA_REVIEW_GITHUB_APP_PRIVATE_KEY_PATH:PATH},
  {readFileSync:()=>candidate}),e=>(candidate.length===0||!e.message.includes(candidate))&&/invalid/.test(e.message));
 }
 assert.throws(()=>read({ACA_REVIEW_GITHUB_APP_PRIVATE_KEY_PATH:PATH},
  {readFileSync:()=>{throw Error("secret-in-exception");}}),e=>!e.message.includes("secret-in-exception"));
});
