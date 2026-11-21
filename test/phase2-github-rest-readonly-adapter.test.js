"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {createGithubProvenanceApi:create}=require("../src/automation/phase2GithubRestReadOnlyAdapter");
const {collectGithubProvenance:collect}=require("../src/automation/phase2GithubProvenanceCollector");
const headSha="a".repeat(40),repositoryId=880001,prNumber=91,workflowId=422174901,appId=15368;
function mockRequest({badStatus=false,redirect=false}={}){
 const seen=[];
 const request=async(url,options)=>{
  seen.push({url,options});
  if(badStatus)return {status:302,data:{},redirected:true};
  if(redirect)return {status:200,data:{},redirected:true};
  if(url.endsWith("/pulls/91"))return {status:200,data:{number:prNumber,head:{sha:headSha,repo:{id:repositoryId}},base:{repo:{id:repositoryId}}}};
  if(url.includes("/check-runs?"))return {status:200,data:{total_count:2,check_runs:["Node tests","PostgreSQL ledger integration"].map((name,i)=>({id:i+1,name,head_sha:headSha,app:{id:appId},check_suite:{id:77},status:"completed",conclusion:"success"}))}};
  if(url.includes("/runs?"))return {status:200,data:{total_count:1,workflow_runs:[{id:44958922280,workflow_id:workflowId,head_sha:headSha,repository:{id:repositoryId},event:"pull_request",check_suite_id:77,run_attempt:1,status:"completed",conclusion:"success"}]}};
  throw Error("unexpected URL "+url);
 };
 return {request,seen};
}
test("pinned REST paths, read-only method and no-redirect contract",async()=>{
 const {request,seen}=mockRequest();const api=create({owner:"alphineaiinc",repo:"aca-realtime-gateway-clean",request});
 const result=await collect({api,repositoryId,prNumber,headSha,workflowId,appId,requiredNames:["Node tests","PostgreSQL ledger integration"]});
 assert.equal(result.status,"no_go");assert.equal(result.verified,false);assert.equal(result.evidence.workflowRunId,44958922280);
 assert.equal(seen.length,3);
 for(const {url,options} of seen){assert.ok(url.startsWith("https://api.github.com/repos/alphineaiinc/aca-realtime-gateway-clean/"));assert.equal(options.method,"GET");assert.equal(options.redirect,"manual");}
});
test("rejects untrusted configuration and invalid paths",async()=>{
 for(const x of [{owner:"evil/path",repo:"r",request:async()=>{}},{owner:"valid",repo:"../other",request:async()=>{}},{owner:"valid",repo:"r"}])assert.throws(()=>create(x));
 const api=create({owner:"alphineaiinc",repo:"aca-realtime-gateway-clean",request:async()=>({status:200,data:{}})});
 assert.throws(()=>api.getPullRequest(-1));assert.throws(()=>api.listCheckRuns("bad",1,100));assert.throws(()=>api.listWorkflowRuns(1,0,100));
});
test("redirect and non-200 responses fail closed",async()=>{
 for(const options of [{badStatus:true},{redirect:true}]){
 const api=create({owner:"alphineaiinc",repo:"aca-realtime-gateway-clean",request:mockRequest(options).request});
 const r=await collect({api,repositoryId,prNumber,headSha,workflowId,appId,requiredNames:["Node tests"]});
 assert.equal(r.status,"no_go");assert.equal(r.reason,"authenticated_api_or_pagination_error");assert.equal(r.evidence,undefined);
 }
});
test("missing total_count is rejected, not interpreted as a complete page",async()=>{
 const api=create({owner:"alphineaiinc",repo:"aca-realtime-gateway-clean",request:async(url)=>url.endsWith("/pulls/91")?{status:200,data:{number:prNumber,head:{sha:headSha,repo:{id:repositoryId}},base:{repo:{id:repositoryId}}}}:{status:200,data:{check_runs:[]}}});
 const r=await collect({api,repositoryId,prNumber,headSha,workflowId,appId,requiredNames:["Node tests"]});
 assert.equal(r.reason,"authenticated_api_or_pagination_error");
});
