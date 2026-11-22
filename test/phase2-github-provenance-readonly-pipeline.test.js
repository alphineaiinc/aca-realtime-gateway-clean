"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {EventEmitter}=require("node:events");
const {runReadOnlyGithubProvenance:run}=require("../src/automation/phase2GithubProvenanceReadOnlyPipeline");
const sha="a".repeat(40),repoId=880001,pr=91,workflow=422174901,appId=15368;
const cfg={owner:"alphineaiinc",repo:"aca-realtime-gateway-clean",token:"fixture-only",
 repositoryId:repoId,prNumber:pr,headSha:sha,workflowId:workflow,appId,
 requiredNames:["Node tests","PostgreSQL ledger integration"]};
function httpsFixture({drift=false,failed=false,untrusted=false}={}){
 let prReads=0;const requests=[];
 const httpsModule={request(url,options,cb){
  const req=new EventEmitter();req.destroy=()=>{};req.end=()=>{
   requests.push({url:url.toString(),method:options.method});
   let body;
   if(url.pathname.endsWith("/pulls/91")){
    prReads++;
    body={number:pr,head:{sha:drift&&prReads===2?"b".repeat(40):sha,repo:{id:repoId}},base:{repo:{id:repoId}}};
   }else if(url.pathname.endsWith("/check-runs")){
    body={total_count:2,check_runs:cfg.requiredNames.map((name,i)=>({
     id:i+1,name,head_sha:sha,app:{id:untrusted?999:appId},
     check_suite:{id:77},status:"completed",conclusion:"success"}))};
   }else if(url.pathname.endsWith("/runs")){
    body={total_count:1,workflow_runs:[{id:44960114038,workflow_id:workflow,
     head_sha:sha,repository:{id:repoId},event:"pull_request",
     check_suite_id:77,run_attempt:1,status:"completed",
     conclusion:failed?"failure":"success"}]};
   }else throw Error("unexpected path");
   const res=new EventEmitter();res.statusCode=200;res.headers={};res.resume=()=>{};
   process.nextTick(()=>{cb(res);res.emit("data",Buffer.from(JSON.stringify(body)));res.emit("end");});
  };return req;
 }};
 return {httpsModule,requests};
}
function locked(r){assert.equal(r.status,"no_go");assert.equal(r.verified,false);
 for(const k of ["operationalActivationAuthorized","agentDispatchAuthorized","dispatched","mergeAuthorized","deployAuthorized","signingAuthorized","productionAuthorization"])assert.equal(r[k],false,k);}
test("full read-only pipeline collects evidence and rechecks PR head",async()=>{
 const fixture=httpsFixture();const r=await run({...cfg,httpsModule:fixture.httpsModule});
 locked(r);assert.equal(r.evidence.workflowRunId,44960114038);
 assert.equal(fixture.requests.length,4);
 assert.ok(fixture.requests.every(x=>x.method==="GET"&&x.url.startsWith("https://api.github.com/repos/")));
});
test("PR head drift between first and final read fails closed",async()=>{
 const r=await run({...cfg,httpsModule:httpsFixture({drift:true}).httpsModule});
 locked(r);assert.equal(r.reason,"pr_head_changed_during_collection");assert.equal(r.evidence,undefined);
});
test("untrusted App and failed CI fail closed",async()=>{
 for(const mode of [{untrusted:true},{failed:true}]){
  const r=await run({...cfg,httpsModule:httpsFixture(mode).httpsModule});
  locked(r);assert.equal(r.evidence,undefined);
 }
});
test("no credential, null input and bad configuration fail closed",async()=>{
 for(const x of [null,{}, {...cfg,token:undefined}, {...cfg,headSha:"wrong"}]){
  const r=await run(x);locked(r);assert.equal(r.evidence,undefined);
 }
});
