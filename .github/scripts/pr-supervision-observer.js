"use strict";

/**
 * Read-only Phase 2 observation adapter. No mutations, checkout of PR code,
 * agent dispatch, or inferred independent review.
 * Caller provides an authenticated Octokit client.
 */
const {evaluatePrSupervision} = require("../../src/automation/prSupervisionPolicy");
const {ALLOWLIST_LABEL, LABELS} = require("../../src/automation/safeQueuePolicy");
const {verifyClosingIssueLink} = require("../../src/automation/verifiedPrLink");

function validNumber(value) {
  return Number.isSafeInteger(value) && value > 0;
}
function sameRepo(pr, repoId) {
  return pr?.head?.repo?.id === repoId && pr?.base?.repo?.id === repoId;
}
function eligibleIssue(issue) {
  if (!issue || issue.pull_request || issue.state !== "open" || !Array.isArray(issue.labels)) return false;
  const labels = new Set(issue.labels.map(x => String(typeof x === "string" ? x : x?.name || "").toLowerCase()));
  return labels.has(ALLOWLIST_LABEL) && labels.has(LABELS.eligible) &&
    labels.has(LABELS.active) && !labels.has(LABELS.blocked);
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
  let trustedLink = false;
  if (typeof github.graphql === "function") {
    const linkData = await github.graphql(`query($owner:String!,$repo:String!,$pr:Int!) {
      repository(owner:$owner,name:$repo) {
        pullRequest(number:$pr) {
          number
          closingIssuesReferences(first:2) {
            pageInfo { hasNextPage }
            nodes { number repository { databaseId } }
          }
        }
      }
    }`, {owner, repo, pr:prNumber});
    trustedLink = verifyClosingIssueLink({prNumber, issueNumber,
      repositoryId:String(repository.id), data:linkData});
  }
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
    issue: {number: issue.number, state: issue.state, eligible: eligibleIssue(issue)},
    pr: {number: pr.number, state: pr.state, headSha, issueNumber, draft: pr.draft},
    trustedHead, trustedLink, ci,
    review: null, correction: null
  });
}
module.exports = {observe, sameRepo, normalizeCheck, eligibleIssue};
