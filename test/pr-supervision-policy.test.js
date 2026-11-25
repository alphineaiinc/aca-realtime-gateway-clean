"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {STATES, evaluatePrSupervision, MAX_CORRECTIONS} = require("../src/automation/prSupervisionPolicy");
const sha = "abc123";
function base() {
  return {
    issue: {number: 20, state: "open", eligible: true},
    pr: {number: 21, state: "open", headSha: sha, issueNumber: 20, draft: false},
    trustedHead: true, trustedLink: true,
    ci: {headSha: sha, requiredChecks: [{name: "Node tests", status: "completed", conclusion: "success", headSha: sha}]},
    review: {headSha: sha, status: "passed", findings: 0, independent: true, source: "trusted_review"},
    correction: {attempts: 0, unchangedFailureCount: 0},
  };
}
test("passed current-head CI and independent review only suggest human approval", () => {
  const result = evaluatePrSupervision(base());
  assert.equal(result.state, STATES.READY);
  assert.equal(result.mergeAuthorized, false);
  assert.equal(result.deployAuthorized, false);
  assert.equal(result.manualDispatchRequired, true);
});
test("missing PR is awaiting PR, not dispatched", () => {
  const input=base();delete input.pr;
  assert.equal(evaluatePrSupervision(input).state, STATES.AWAITING_PR);
});
test("invalid issue and ineligible issue stop", () => {
  let input=base(); input.issue.eligible=undefined;
  assert.equal(evaluatePrSupervision(input).state, STATES.BLOCKED);
  input=base(); input.issue.state="closed";
  assert.equal(evaluatePrSupervision(input).state, STATES.BLOCKED);
});
test("mismatched issue or untrusted link fails closed", () => {
  let input=base(); input.pr.issueNumber=22;
  assert.equal(evaluatePrSupervision(input).state, STATES.BLOCKED);
  input=base(); input.trustedLink=false;
  assert.equal(evaluatePrSupervision(input).state, STATES.BLOCKED);
});
test("closed PR is terminal; draft PR never ready", () => {
  let input=base(); input.pr.state="closed";
  assert.equal(evaluatePrSupervision(input).state, STATES.CLOSED);
  input=base(); input.pr.draft=true;
  assert.equal(evaluatePrSupervision(input).state, STATES.BLOCKED);
});
test("stale check or stale aggregate CI is not passed", () => {
  let input=base(); input.ci.requiredChecks[0].headSha="old";
  assert.equal(evaluatePrSupervision(input).state, STATES.BLOCKED);
  input=base(); input.ci.headSha="old";
  assert.equal(evaluatePrSupervision(input).state, STATES.CI_PENDING);
});
test("missing or cancelled check is not success", () => {
  let input=base();input.ci.requiredChecks=[];
  assert.equal(evaluatePrSupervision(input).state, STATES.CI_PENDING);
  input=base();input.ci.requiredChecks[0].conclusion="cancelled";
  assert.equal(evaluatePrSupervision(input).state, STATES.CI_PENDING);
});
test("CI failure requests at most bounded human-coordinated corrections", () => {
  let input=base();input.ci.requiredChecks[0].conclusion="failure";
  assert.equal(evaluatePrSupervision(input).state, STATES.CI_FAILED);
  assert.deepEqual(evaluatePrSupervision(input).correction, {allowed:true,remaining:MAX_CORRECTIONS});
  input.correction.attempts=2;
  assert.equal(evaluatePrSupervision(input).state, STATES.BLOCKED);
});
test("unchanged failure escalates without retrying", () => {
  const input=base();input.ci.requiredChecks[0].conclusion="failure";
  input.correction.unchangedFailureCount=1;
  assert.equal(evaluatePrSupervision(input).state, STATES.BLOCKED);
});
test("stale review and untrusted review remain pending", () => {
  let input=base();input.review.headSha="old";
  assert.equal(evaluatePrSupervision(input).state, STATES.REVIEW_PENDING);
  input=base();input.review.source="pr_body";
  assert.equal(evaluatePrSupervision(input).state, STATES.REVIEW_PENDING);
  input=base();input.review.independent=false;
  assert.equal(evaluatePrSupervision(input).state, STATES.REVIEW_PENDING);
});
test("review findings permit bounded coordination, never dispatch", () => {
  const input=base();input.review.status="findings";input.review.findings=2;
  let decision=evaluatePrSupervision(input);
  assert.equal(decision.state, STATES.CORRECTION_NEEDED);
  assert.equal(decision.correction.allowed,true);
  assert.equal(decision.manualDispatchRequired,true);
  input.correction.attempts=2;decision=evaluatePrSupervision(input);
  assert.equal(decision.state, STATES.BLOCKED);
});
test("ambiguous or missing correction ledger fails closed", () => {
  let input=base();delete input.correction;
  assert.equal(evaluatePrSupervision(input).state, STATES.BLOCKED);
  input=base();input.correction.attempts=-1;
  assert.equal(evaluatePrSupervision(input).state, STATES.BLOCKED);
});
test("unknown check outcome or ambiguous review cannot become ready", () => {
  let input=base();input.ci.requiredChecks[0].conclusion="wat";
  assert.equal(evaluatePrSupervision(input).state, STATES.BLOCKED);
  input=base();input.review.status="approved";input.review.findings=0;
  assert.equal(evaluatePrSupervision(input).state, STATES.BLOCKED);
});
test("duplicate CI check names cause fail-closed evidence conflict", () => {
  const input=base();input.ci.requiredChecks.push({...input.ci.requiredChecks[0]});
  assert.equal(evaluatePrSupervision(input).state, STATES.BLOCKED);
});

test("queued and in-progress checks with null conclusions remain pending", () => {
  for (const status of ["queued", "in_progress"]) {
    const input=base();
    input.ci.requiredChecks[0].status=status;
    input.ci.requiredChecks[0].conclusion=null;
    const result=evaluatePrSupervision(input);
    assert.equal(result.state, STATES.CI_PENDING);
    assert.equal(result.mergeAuthorized, false);
  }
});
test("completed check without a conclusion fails closed", () => {
  const input=base();
  input.ci.requiredChecks[0].conclusion=null;
  assert.equal(evaluatePrSupervision(input).state, STATES.BLOCKED);
});

test("unknown recurrence after prior correction denies further correction but does not prevent successful CI and review",()=>{
 const input=base();input.correction={attempts:1,unchangedFailureCount:null};
 assert.equal(evaluatePrSupervision(input).state,STATES.READY);
 input.ci.requiredChecks[0].conclusion="failure";assert.equal(evaluatePrSupervision(input).correction.allowed,false);
 input.ci.requiredChecks[0].conclusion="success";input.review.status="findings";input.review.findings=1;assert.equal(evaluatePrSupervision(input).correction.allowed,false);
});
