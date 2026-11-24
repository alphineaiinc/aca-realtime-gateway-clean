"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {generateKeyPairSync}=require("node:crypto");
const {once}=require("node:events");
const {startServer,signVerdict}=require("../src/automation/reviewerStagingServer");
const {verifySignedReview}=require("../src/automation/signedReviewEvidence");
const sha="a".repeat(40),otherSha="b".repeat(40),repositoryId=1080201236,reviewerId=800;
const token="isolated-test-token-"+("x".repeat(32));
const scope={repositoryId,issueNumber:20,prNumber:21,headSha:sha,challenge:"c".repeat(64)};
const keys=generateKeyPairSync("ed25519");
const pem=keys.privateKey.export({type:"pkcs8",format:"pem"});
const goodPr={number:21,state:"open",draft:false,user:{id:230486228},
 head:{sha,repo:{id:repositoryId}},base:{repo:{id:repositoryId}}};
const approved={id:42,user:{id:reviewerId},state:"APPROVED",
 commit_id:sha,submitted_at:"2026-11-21T05:00:00Z"};
function makeServer({pr=goodPr,reviews=[approved],latePr=pr,lateReviews=reviews,failed=false}={}){
 let prReads=0,reviewReads=0;const paths=[];
 const server=startServer({PORT:"0",ACA_REVIEW_REPOSITORY:"alphineaiinc/aca-realtime-gateway-clean",
 ACA_REVIEW_GITHUB_APP_ID:"5858755",ACA_REVIEW_GITHUB_INSTALLATION_ID:"184252224",
 ACA_REVIEW_REPOSITORY_ID:String(repositoryId),ACA_REVIEWER_ID:String(reviewerId),
 ACA_REVIEW_API_TOKEN:token,ACA_REVIEW_PRIVATE_KEY:pem,
 ACA_REVIEW_GITHUB_APP_PRIVATE_KEY_PATH:"/etc/secrets/github-reviewer-app.pem"},
 {githubAppKeyReader:()=> "test-only-mock",
  githubTokenProvider:async({repositoryId:id})=>{assert.equal(id,repositoryId);return "mock-read-token";},
  githubFetch:async(url,options)=>{
    paths.push(url);
    assert.equal(options.headers.Authorization,"Bearer mock-read-token");
    if(failed)throw new Error("github_unavailable");
    const data=url.includes("/reviews?")?(++reviewReads===1?reviews:lateReviews):(++prReads===1?pr:latePr);
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
test("exact-head approval alone cannot produce a signed verdict",async()=>{
 await withServer({},async({server,paths})=>{
  const response=await callReviewer(server);
  assert.equal(response.status,409);
  assert.deepEqual(await response.json(),{error:"substantive_independent_disposition_required"});
  assert.equal(paths.length,4);
 });
});
test("isolated disposable-key envelope retains cryptographic scope binding",()=>{
 const envelope=signVerdict(scope,reviewerId,pem);
 assert.equal(verifySignedReview({envelope,publicKey:keys.publicKey,...scope,reviewerId}).status,"passed");
 for(const mismatch of [{headSha:otherSha},{challenge:"d".repeat(64)},{issueNumber:99},{publicKey:generateKeyPairSync("ed25519").publicKey}]){
  assert.equal(verifySignedReview({envelope,publicKey:keys.publicKey,...scope,reviewerId,...mismatch}),null);
 }
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

test("approval dismissed between evidence fetches fails closed",async()=>{
 await withServer({lateReviews:[{...approved,state:"DISMISSED"}]},async({server})=>{
  const response=await callReviewer(server);
  assert.equal(response.status,409);
  assert.equal((await response.json()).error,"review_head_changed");
 });
});

test("review rejects absent challenge and denies approval-only signing",async()=>{
 await withServer({},async({server,paths})=>{
  assert.equal((await callReviewer(server,{...scope,challenge:undefined})).status,503);
  assert.equal(paths.length,0);
  const r=await callReviewer(server);assert.equal(r.status,409);
  assert.deepEqual(await r.json(),{error:"substantive_independent_disposition_required"});
 });
});
