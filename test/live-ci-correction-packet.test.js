"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {createLiveCiCorrectionPacket}=require("../src/automation/liveCiCorrectionPacket");
const head="a".repeat(40),repoId=1080201236;
const settings={owner:"alphineaiinc",repo:"aca-realtime-gateway-clean",
 repositoryId:repoId,prNumber:21,headSha:head,
 issue:{number:41,state:"open",eligible:true},
 correction:{attempts:0,unchangedFailureCount:0},trustedLink:true,
 requiredNames:["Node tests"],trustedAppId:15368,trustedWorkflowId:5503};
const pr={number:21,state:"open",draft:false,head:{sha:head,repo:{id:repoId}},
 base:{sha:"b".repeat(40),repo:{id:repoId}}};
const repo={id:repoId,full_name:"alphineaiinc/aca-realtime-gateway-clean"};
function check(conclusion="failure"){return {name:"Node tests",status:"completed",conclusion,
 head_sha:head,app:{id:15368},
 check_suite:{workflow_run:{workflow_id:5503,head_sha:head,id:99,run_attempt:1}}};}
function mock({initial=pr,after=initial,repos=repo,runs=[check()],totalCount=runs.length,
 fail=null}={}){
 const calls=[];let prs=0;
 const get=(kind,value)=>async params=>{calls.push({kind,params});
  if(kind===fail)throw Error("offline");return {data:value};};
 return {calls,github:{rest:{
  repos:{get:get("repository",repos)},
  pulls:{get:async params=>{calls.push({kind:"pull",params});if(fail==="pull")throw Error("offline");
   return {data:++prs===1?initial:after};}},
  checks:{listForRef:get("checks",{check_runs:runs,total_count:totalCount})}
 }}};
}
test("verified failing CI yields bounded correction packet without dispatch",async()=>{
 const m=mock();
 const p=await createLiveCiCorrectionPacket({...settings,github:m.github});
 assert.equal(p.status,"advisory");
 assert.equal(p.state,"ci_failed");
 assert.equal(p.proposal.attempt,1);
 assert.equal(p.proposal.scope.headSha,head);
 assert.equal(p.dispatched,false);
 assert.equal(p.mergeAuthorized,false);
 assert.equal(p.deployAuthorized,false);
 assert.deepEqual(m.calls.map(x=>x.kind),["repository","pull","checks","pull"]);
});
test("CI passing but no independent review cannot grant readiness",async()=>{
 const m=mock({runs:[check("success")]});
 const p=await createLiveCiCorrectionPacket({...settings,github:m.github});
 assert.equal(p.state,"review_pending");
 assert.equal(p.proposal,null);
 assert.equal(p.dispatched,false);
});
test("draft PR cannot generate correction proposal",async()=>{
 const m=mock({initial:{...pr,draft:true}});
 const p=await createLiveCiCorrectionPacket({...settings,github:m.github});
 assert.equal(p.status,"advisory");
 assert.equal(p.state,"blocked");
 assert.equal(p.proposal,null);
});
test("wrong app, stale head, incomplete pages, and changed PR fail closed",async()=>{
 const cases=[
  {runs:[{...check(),app:{id:999}}]},
  {runs:[{...check(),head_sha:"c".repeat(40)}]},
  {totalCount:2},
  {after:{...pr,head:{...pr.head,sha:"d".repeat(40)}}},
  {repos:{...repo,id:999}},
  {fail:"checks"}
 ];
 for(const c of cases){
  const m=mock(c);
  const p=await createLiveCiCorrectionPacket({...settings,github:m.github});
  assert.equal(p.status,"blocked");
  assert.equal(p.proposal,null);
  assert.equal(p.dispatched,false);
 }
});
test("unverified issue link fails before any network calls",async()=>{
 const m=mock();
 const p=await createLiveCiCorrectionPacket({...settings,trustedLink:false,github:m.github});
 assert.equal(p.status,"blocked");
 assert.equal(m.calls.length,0);
});
test("exhausted correction budget refuses new task even when CI fails",async()=>{
 const m=mock();
 const p=await createLiveCiCorrectionPacket({...settings,correction:{attempts:2,unchangedFailureCount:0},github:m.github});
 assert.equal(p.state,"blocked");assert.equal(p.proposal,null);
});
