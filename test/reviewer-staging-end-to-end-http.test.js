"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {generateKeyPairSync}=require("node:crypto");
const {once}=require("node:events");
const {startServer}=require("../src/automation/reviewerStagingServer");
const {verifySignedReview}=require("../src/automation/signedReviewEvidence");
const sha="a".repeat(40),otherSha="b".repeat(40),repositoryId=1080201236,reviewerId=800;
const token="isolated-test-token-"+("x".repeat(32));
const scope={repositoryId,issueNumber:20,prNumber:21,headSha:sha};
const keys=generateKeyPairSync("ed25519");
const pem=keys.privateKey.export({type:"pkcs8",format:"pem"});
const goodPr={number:21,state:"open",draft:false,user:{id:230486228},
 head:{sha,repo:{id:repositoryId}},base:{repo:{id:repositoryId}}};
const approved={id:42,user:{id:reviewerId},state:"APPROVED",
 commit_id:sha,submitted_at:"2026-11-21T05:00:00Z"};
function makeServer({pr=goodPr,reviews=[approved],latePr=pr,failed=false}={}){
 let prReads=0;const paths=[];
 const server=startServer({PORT:"0",ACA_REVIEW_REPOSITORY:"alphineaiinc/aca-realtime-gateway-clean",
 ACA_REVIEW_GITHUB_APP_ID:"5858755",ACA_REVIEW_GITHUB_INSTALLATION_ID:"184252224",
 ACA_REVIEW_REPOSITORY_ID:String(repositoryId),ACA_REVIEWER_ID:String(reviewerId),
 ACA_REVIEW_API_TOKEN:token,ACA_REVIEW_PRIVATE_KEY:pem,
 ACA_REVIEW_GITHUB_APP_PRIVATE_KEY:"test-only-mock"},
 {githubTokenProvider:async({repositoryId:id})=>{assert.equal(id,repositoryId);return "mock-read-token";},
  githubFetch:async(url,options)=>{
    paths.push(url);
    assert.equal(options.headers.Authorization,"Bearer mock-read-token");
    if(failed)throw new Error("github_unavailable");
    const data=url.includes("/reviews?")?reviews:(++prReads===1?pr:latePr);
    return {ok:true,json:async()=>data};
  }});
 return {server,paths};
}
async function callReviewer(server,body=scope,bearer=token){
 if(!server.listening)await once(server,"listening");
 const url="http://127.0.0.1:"+server.address().port;
 return fetch(url+"/review",{method:"POST",
  headers:{"Content-Type":"application/json",Authorization:"Bearer "+bearer},
  body:JSON.stringify(body)});
}
async function withServer(options,action){
 const env=makeServer(options);
 try{await action(env);}
 finally{await new Promise((resolve,reject)=>env.server.close(e=>e?reject(e):resolve()));}
}
test("full authenticated HTTP review signs only independently approved exact commit",async()=>{
 await withServer({},async({server,paths})=>{
  const response=await callReviewer(server);
  assert.equal(response.status,200);
  const envelope=await response.json();
  assert.equal(paths.length,3,"fetch PR, approved reviews, then current PR again");
  const review=verifySignedReview({envelope,publicKey:keys.publicKey,repositoryId,
    prNumber:21,headSha:sha,reviewerId});
  assert.equal(review.status,"passed");
  assert.equal(verifySignedReview({envelope,publicKey:keys.publicKey,repositoryId,
    prNumber:21,headSha:otherSha,reviewerId}),null);
  assert.equal(verifySignedReview({envelope,publicKey:generateKeyPairSync("ed25519").publicKey,
    repositoryId,prNumber:21,headSha:sha,reviewerId}),null);
 });
});
test("stale head changed during review cannot sign",async()=>{
 await withServer({latePr:{...goodPr,head:{...goodPr.head,sha:otherSha}}},async({server})=>{
  const response=await callReviewer(server);
  assert.equal(response.status,409);
  assert.equal((await response.json()).error,"review_head_changed");
 });
});
test("draft PR, self-review, outdated review, change request, service outage fail closed",async()=>{
 for(const options of [
  {pr:{...goodPr,draft:true}},
  {pr:{...goodPr,user:{id:reviewerId}}},
  {reviews:[{...approved,commit_id:otherSha}]},
  {reviews:[{...approved,state:"CHANGES_REQUESTED"}]},
  {failed:true}
 ]){
  await withServer(options,async({server})=>{
   const response=await callReviewer(server);
   assert.notEqual(response.status,200);
  });
 }
});
test("wrong repository and wrong bearer cannot sign",async()=>{
 await withServer({},async({server})=>{
  assert.equal((await callReviewer(server,{...scope,repositoryId:123})).status,503);
  assert.equal((await callReviewer(server,scope,"not-the-token")).status,401);
 });
});
