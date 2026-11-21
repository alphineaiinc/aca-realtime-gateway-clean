"use strict";

/**
 * Read-only Phase 2 observation adapter. No mutations, checkout of PR code,
 * agent dispatch, or inferred independent review.
 * Caller provides an authenticated Octokit client.
 */
const {evaluatePrSupervision} = require("../../src/automation/prSupervisionPolicy");

function validNumber(value) {
  return Number.isSafeInteger(value) && value > 0;
}
function sameRepo(pr, repoId) {
  return pr?.head?.repo?.id === repoId && pr?.base?.repo?.id === repoId;
}
function normalizeCheck(run, sha) {
  return {name: run.name, headSha: run.head_sha, status: run.status,
    conclusion: run.conclusion};
}
async function observe({github, owner, repo, prNumber, issueNumber}) {
  if (!github?.rest || !owner || !repo || !validNumber(prNumber) || !validNumber(issueNumber)) {
    throw new Error("invalid_observer_arguments");
  }
  const {data: repository} = await github.rest.repos.get({owner, repo});
  const {data: pr} = await github.rest.pulls.get({owner, repo, pull_number: prNumber});
  const {data: issue} = await github.rest.issues.get({owner, repo, issue_number: issueNumber});
  const headSha = pr?.head?.sha;
  const trustedHead = Boolean(headSha && sameRepo(pr, repository.id));
  const {data: checks} = await github.rest.checks.listForRef({
    owner, repo, ref: headSha, per_page: 100, filter: "latest"
  });
  // Strict: pagination or incomplete check evidence cannot yield readiness.
  const runs = checks.check_runs || [];
  const required = runs.filter(run => run.name === "Node tests");
  const completeChecks = checks.total_count === runs.length && required.length === 1;
  const ci = {headSha, requiredChecks: completeChecks ?
    required.map(run => normalizeCheck(run, headSha)) : []};
  // Independent Codex review provenance is NOT established by GitHub approvals.
  // Fail closed until a separate authenticated review adapter exists.
  return evaluatePrSupervision({
    issue: {number: issue.number, state: issue.state, eligible: false},
    pr: {number: pr.number, state: pr.state, headSha, issueNumber, draft: pr.draft},
    trustedHead, trustedLink: false, ci,
    review: null, correction: {attempts: 0, unchangedFailureCount: 0}
  });
}
module.exports = {observe, sameRepo, normalizeCheck};
