"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {observe, sameRepo, normalizeCheck} = require("../.github/scripts/pr-supervision-observer");
function fixture() {
  const calls=[];
  const github={rest:{
    repos:{get:async()=>({data:{id:42}})},
    pulls:{get:async()=>({data:{number:21,state:"open",draft:false,head:{sha:"abc",repo:{id:42}},base:{repo:{id:42}}}})},
    issues:{get:async()=>({data:{number:20,state:"open"}})},
    checks:{listForRef:async args=>{calls.push(args);return {data:{total_count:1,check_runs:[{name:"Node tests",head_sha:"abc",status:"completed",conclusion:"success"}]}}}}
  }};
  return {github,calls};
}
test("read-only observer does not infer trusted issue links or reviews",async()=>{
  const {github,calls}=fixture();
  const result=await observe({github,owner:"acme",repo:"service",prNumber:21,issueNumber:20});
  assert.equal(result.state,"blocked");
  assert.equal(result.mergeAuthorized,false);
  assert.equal(result.deployAuthorized,false);
  assert.equal(calls[0].ref,"abc");
});
test("rejects missing and malformed arguments before any API access",async()=>{
  await assert.rejects(observe({github:{},owner:"x",repo:"y",prNumber:0,issueNumber:20}),/invalid_observer_arguments/);
});
test("forked PR is not a trusted repository head",()=>{
  assert.equal(sameRepo({head:{repo:{id:1}},base:{repo:{id:2}}},2),false);
});
test("check normalization preserves original head SHA for stale-evidence detection",()=>{
  assert.equal(normalizeCheck({name:"Node tests",head_sha:"old",status:"completed",conclusion:"success"},"new").headSha,"old");
});

test("observer fails closed when PR changes during evidence collection",async()=>{
 for(const change of ["head","closed","draft","repo","unchanged"]){
  const {github}=fixture();let reads=0,changed=false;
  const get=github.rest.pulls.get,checks=github.rest.checks.listForRef;
  github.rest.checks.listForRef=async args=>{changed=true;return checks(args);};
  github.rest.pulls.get=async()=>{reads++;const result=await get();if(changed){const pr=result.data;if(change==="head")pr.head.sha="new";if(change==="closed")pr.state="closed";if(change==="draft")pr.draft=true;if(change==="repo")pr.head.repo.id=99;}return result;};
  const run=()=>observe({github,owner:"acme",repo:"service",prNumber:21,issueNumber:20});
  if(change==="unchanged")assert.equal((await run()).mergeAuthorized,false);else await assert.rejects(run(),/stale_pr_observation/);
  assert.equal(reads,2);
 }
});
