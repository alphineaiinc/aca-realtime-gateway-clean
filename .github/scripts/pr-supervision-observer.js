"use strict";

/**
 * Read-only Phase 2 observation adapter. No mutations, checkout of PR code,
 * agent dispatch, or inferred independent review.
 * Caller provides an authenticated Octokit client.
 */
const {evaluatePrSupervision} = require("../../src/automation/prSupervisionPolicy");
const {ALLOWLIST_LABEL, LABELS} = require("../../src/automation/safeQueuePolicy");
const {verifyClosingIssueLink} = require("../../src/automation/verifiedPrLink");
const {readCorrectionHistory} = require("../../src/automation/postgresCorrectionHistoryReader");
const {verifyReviewEvidence} = require("../../src/automation/trustedReviewEvidence");

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
async function observe({github, owner, repo, prNumber, issueNumber,
  authenticatedLedgerClient, trustedReviewProvider, trustedReviewerId}) {
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
  const requiredNames = ["Node tests", "PostgreSQL ledger integration"];
  const required = runs.filter(run => requiredNames.includes(run.name));
  const completeChecks = checks.total_count === runs.length &&
    required.length === requiredNames.length &&
    requiredNames.every(name => required.filter(run => run.name === name).length === 1);
  const ci = {headSha, requiredChecks: completeChecks ?
    required.map(run => normalizeCheck(run, headSha)) : []};
  // Optional authenticated providers. No provider means unknown, never success.
  // Provider identity is established by the calling service, not by PR content.
  let correction = null;
  if (trustedHead && trustedLink && authenticatedLedgerClient) {
    try {
      correction = await readCorrectionHistory(authenticatedLedgerClient, {
        repositoryId: repository.id, issueNumber, prNumber
      });
      // Ledger history must be bound to this head after any correction.
      if (correction.attempts > 0 && correction.lastResultingHeadSha !== headSha)
        correction = null;
    } catch { correction = null; }
  }
  let review = null;
  if (trustedHead && trustedLink && typeof trustedReviewProvider === "function" &&
      validNumber(trustedReviewerId)) {
    try {
      const evidence = await trustedReviewProvider({repositoryId:repository.id,
        issueNumber,prNumber,headSha});
      review = verifyReviewEvidence({record:evidence?.record,
        authenticatedActorId:evidence?.authenticatedActorId,
        trustedReviewerId,expectedPrNumber:prNumber,expectedHeadSha:headSha});
    } catch { review = null; }
  }
  return evaluatePrSupervision({
    issue: {number: issue.number, state: issue.state, eligible: eligibleIssue(issue)},
    pr: {number: pr.number, state: pr.state, headSha, issueNumber, draft: pr.draft},
    trustedHead, trustedLink, ci,
    review, correction
  });
}
module.exports = {observe, sameRepo, normalizeCheck, eligibleIssue};
