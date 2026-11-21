"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {bindChecksToWorkflowRuns}=require("../src/automation/ciWorkflowRunBinding");
const {verifiedRequiredChecks}=require("../src/automation/verifiedCiEvidence");
const sha="a".repeat(40),names=["Node tests","PostgreSQL ledger integration"];
const checks=names.map(name=>({name,head_sha:sha,status:"completed",conclusion:"success",
 app:{id:123},check_suite:{id:88}}));
const workflowRuns=[{id:55,workflow_id:999,head_sha:sha,check_suite_id:88}];
const args={checks,workflowRuns,headSha:sha,trustedWorkflowId:999};
const verify=bound=>verifiedRequiredChecks({runs:bound,totalCount:2,headSha:sha,
 requiredNames:names,trustedAppId:123,trustedWorkflowId:999});
test("binds two required checks to authenticated workflow suite",()=>{
 assert.equal(verify(bindChecksToWorkflowRuns(args)).length,2);
});
test("rejects wrong workflow, wrong SHA, missing suite, and duplicate runs",()=>{
 for(const altered of [
  [{...workflowRuns[0],workflow_id:111}],
  [{...workflowRuns[0],head_sha:"b".repeat(40)}],
  [{...workflowRuns[0],check_suite_id:777}],
  [workflowRuns[0],{...workflowRuns[0],id:56}]
 ])assert.equal(verify(bindChecksToWorkflowRuns({...args,workflowRuns:altered})),null);
});
test("rejects checks from mismatched check suites and forged app IDs",()=>{
 const mismatch=[checks[0],{...checks[1],check_suite:{id:99}}];
 assert.equal(verify(bindChecksToWorkflowRuns({...args,checks:mismatch})),null);
 const spoof=[checks[0],{...checks[1],app:{id:999}}];
 assert.equal(verify(bindChecksToWorkflowRuns({...args,checks:spoof})),null);
});

test("rejects malformed run identifiers, absent suite metadata and stale run head",()=>{
 for(const workflowRuns of [
  [{...workflowRunsFixture(),id:0}],
  [{...workflowRunsFixture(),id:"55"}],
  [{...workflowRunsFixture(),check_suite_id:0}],
  [{...workflowRunsFixture(),check_suite_id:"88"}],
  [{...workflowRunsFixture(),head_sha:"b".repeat(40)}]
 ])assert.equal(verify(bindChecksToWorkflowRuns({...args,workflowRuns})),null);
 for(const checkSet of [
  [checks[0],{...checks[1],check_suite:null}],
  [checks[0],{...checks[1],check_suite:{}}],
  [checks[0],{...checks[1],check_suite:{id:"88"}}]
 ])assert.equal(verify(bindChecksToWorkflowRuns({...args,checks:checkSet})),null);
});
function workflowRunsFixture(){return {...workflowRuns[0]};}
test("rejects conflicting workflow-suite association even when one matching run exists",()=>{
 const conflicting=[workflowRuns[0],{...workflowRuns[0],id:999,workflow_id:111}];
 // A non-pinned workflow must not supply authority to the pinned run.
 const bound=bindChecksToWorkflowRuns({...args,workflowRuns:conflicting});
 assert.equal(verify(bound).length,2);
 const duplicatePinned=[workflowRuns[0],{...workflowRuns[0],id:999}];
 assert.equal(bindChecksToWorkflowRuns({...args,workflowRuns:duplicatePinned}),null);
});
