"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {bindChecksToWorkflowRuns}=require("../src/automation/ciWorkflowRunBinding");
const {verifiedRequiredChecks}=require("../src/automation/verifiedCiEvidence");
const sha="a".repeat(40),names=["Node tests","PostgreSQL ledger integration"];
const checks=names.map(name=>({name,head_sha:sha,status:"completed",conclusion:"success",
 app:{id:123},check_suite:{id:88}}));
const workflowRuns=[{id:55,workflow_id:999,head_sha:sha,check_suite_id:88,run_attempt:1}];
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
