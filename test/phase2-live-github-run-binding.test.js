"use strict";
const {test}=require("node:test");const assert=require("node:assert/strict");
const {verifyLiveGithubRunBinding:verify}=require("../src/automation/phase2LiveGithubRunBinding");
const sha="a".repeat(40),expectedRepositoryId=880001,expectedWorkflowId=422174901,expectedAppId=5858755;
const pr={state:"closed",base:{ref:"main",repo:{id:expectedRepositoryId}},head:{sha,repo:{id:expectedRepositoryId}}};
const run={id:44958922280,workflow_id:expectedWorkflowId,head_sha:sha,repository:{id:expectedRepositoryId},event:"pull_request",check_suite_id:123,run_attempt:1,status:"completed",conclusion:"success"};
const jobs=[{id:137013146479,head_sha:sha,status:"completed",conclusion:"success",check_run:{app:{id:expectedAppId}}}];
const config={expectedRepositoryId,expectedHeadSha:sha,expectedWorkflowId,expectedAppId};
function locked(result){assert.equal(result.status,"no_go");assert.equal(result.verified,false);for(const key of ["operationalActivationAuthorized","agentDispatchAuthorized","dispatched","mergeAuthorized","deployAuthorized","signingAuthorized","productionAuthorization"])assert.equal(result[key],false,key);}
test("partial real workflow API response cannot establish provenance",()=>{
 const result=verify({...config,pr,run:{id:run.id,workflow_id:run.workflow_id,status:"completed",conclusion:"success"},jobs:jobs.map(({id,status,conclusion})=>({id,status,conclusion}))});
 locked(result);assert.ok(result.missing.includes("complete_workflow_provenance"));assert.ok(result.missing.includes("pinned_app_and_job_provenance"));
});
test("missing or mismatched identity fails closed",()=>{
 for(const value of [null,{}, {pr,run,jobs}, {...config,pr:{...pr,head:{...pr.head,sha:"b".repeat(40)}},run,jobs},{...config,pr,run:{...run,workflow_id:12},jobs},{...config,pr,run,jobs:[{...jobs[0],check_run:{app:{id:2}}}]}]){
 const result=verify(value);locked(result);assert.ok(result.missing.length>0);
 }
});
test("even complete synthetic claims cannot authorize actions",()=>{
 const result=verify({...config,pr,run,jobs});locked(result);assert.deepEqual(result.missing,[]);
});
