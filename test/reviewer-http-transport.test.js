"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {createReviewerHttpTransport}=require("../src/automation/reviewerHttpTransport");
const {createTrustedReviewProvider}=require("../src/automation/trustedReviewerProvider");
const scope={repositoryId:55,issueNumber:20,prNumber:21,headSha:"a".repeat(40)};
const token="t".repeat(48);
function mockResponse(body,{status=200,type="application/json",length}={}){
 const bytes=Buffer.from(body);
 return {status,ok:status===200,headers:{get:key=>key==="content-type"?type:key==="content-length"?length:null},
   arrayBuffer:async()=>bytes,body:new ReadableStream({start(controller){controller.enqueue(bytes);controller.close();}})};
}
test("reviewer transport enforces trusted endpoint and bearer post",async()=>{
 const fetchImpl=async(url,options)=>{
  assert.equal(url,"https://review.example.test/review");
  assert.equal(options.method,"POST");
  assert.equal(options.redirect,"error");
  assert.equal(options.headers.Authorization,"Bearer "+token);
  assert.deepEqual(JSON.parse(options.body),scope);
  return mockResponse(JSON.stringify({record:{status:"pending"},signature:"abcd"}));
 };
 const transport=createReviewerHttpTransport({token,fetchImpl});
 const provider=createTrustedReviewProvider({endpoint:"https://review.example.test/review",
 allowedHost:"review.example.test",transport});
 assert.equal((await provider(scope)).record.status,"pending");
});
test("reviewer transport rejects empty token, redirects, errors, invalid JSON and oversized bodies",async()=>{
 assert.throws(()=>createReviewerHttpTransport({token:"short"}),/invalid_reviewer_transport_configuration/);
 for(const response of [mockResponse("{}",{status:302}),mockResponse("{}",{status:503}),
 mockResponse("{}",{type:"text/html"}),mockResponse("bad"),mockResponse("x".repeat(1200))]){
  const transport=createReviewerHttpTransport({token,fetchImpl:async()=>response,maxBytes:1024});
  await assert.rejects(transport("https://review.example.test/review",scope));
 }
});
