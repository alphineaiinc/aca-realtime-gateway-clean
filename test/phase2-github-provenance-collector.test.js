"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {collectPages,collectGithubProvenance:collect}=require("../src/automation/phase2GithubProvenanceCollector");
const repositoryId=880001,prNumber=91,headSha="a".repeat(40),workflowId=422174901,appId=15368;
const config={repositoryId,prNumber,headSha,workflowId,appId,requiredNames:["Node tests","PostgreSQL ledger integration"]};
const pr={number:prNumber,head:{repo:{id:repositoryId},sha:headSha},base:{repo:{id:repositoryId}}};
const run={id:1,workflow_id:workflowId,head_sha:headSha,repository:{id:repositoryId},event:"pull_request",check_suite_id:77,run_attempt:1,status:"completed",conclusion:"success"};
const checks=config.requiredNames.map((name,i)=>({id:i+1,name,head_sha:headSha,app:{id:appId},check_suite:{id:77},status:"completed",conclusion:"success"}));
const api=(overrides={})=>({getPullRequest:async()=>pr,listCheckRuns:async()=>({total_count:2,items:checks}),listWorkflowRuns:async()=>({total_count:1,items:[run]}),...overrides});
function locked(r){assert.equal(r.status,"no_go");assert.equal(r.verified,false);for(const k of ["agentDispatchAuthorized","dispatched","mergeAuthorized","deployAuthorized","signingAuthorized","productionAuthorization","operationalActivationAuthorized"])assert.equal(r[k],false,k);}
test("complete synthetic provenance is evidence only, never authorization",async()=>{const r=await collect({...config,api:api()});locked(r);assert.equal(r.evidence.workflowRunId,1)});
test("incomplete pages and total-count changes fail closed",async()=>{
 for(const response of [{items:checks},{total_count:3,items:checks},{total_count:2,items:[checks[0]]}]){
 const r=await collect({...config,api:api({listCheckRuns:async()=>response})});locked(r);assert.equal(r.reason,"authenticated_api_or_pagination_error");
 }
});
test("duplicate required check and untrusted app fail closed",async()=>{
 for(const rows of [[checks[0],checks[0],checks[1]],[{...checks[0],app:{id:999}},checks[1]]]){
 const r=await collect({...config,api:api({listCheckRuns:async()=>({total_count:rows.length,items:rows})})});locked(r);assert.equal(r.evidence,undefined);
 }
});
test("changed PR head, ambiguous reruns and failed CI fail closed",async()=>{
 for(const changed of [
  api({getPullRequest:async()=>({...pr,head:{...pr.head,sha:"b".repeat(40)}})}),
  api({listWorkflowRuns:async()=>({total_count:2,items:[run,{...run,id:2,run_attempt:2}]})}),
  api({listWorkflowRuns:async()=>({total_count:1,items:[{...run,conclusion:"failure"}]})})
 ]){const r=await collect({...config,api:changed});locked(r);assert.equal(r.evidence,undefined);}
});
test("pagination traverses full pages and rejects limits",async()=>{
 const rows=Array.from({length:101},(_,i)=>i);
 const out=await collectPages(async page=>({total_count:101,items:page===1?rows.slice(0,100):rows.slice(100)}));assert.equal(out.length,101);
 await assert.rejects(collectPages(async()=>({total_count:101,items:rows.slice(0,100)}),{maxPages:1}));
});
test("null and missing authenticated API fail closed",async()=>{for(const input of [null,{},config]){const r=await collect(input);locked(r)}});
