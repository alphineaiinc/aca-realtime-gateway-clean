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
const {randomBytes} = require("node:crypto");
const {validateDisposition} = require("../../src/automation/substantiveDisposition");
const {verifiedRequiredChecks} = require("../../src/automation/verifiedCiEvidence");
const {fetchBoundChecks} = require("../../src/automation/ciWorkflowRunBinding");

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
  authenticatedLedgerClient, trustedReviewProvider, trustedReviewerId,
  trustedCiAppId, trustedCiWorkflowId, trustedReviewerPublicKey, trustedEvidenceDigestProvider, trustedKeyStatusProvider, trustedFailureFingerprintProvider}) {
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
  let runs = null;
  if (checks.total_count <= 100) {
    try { runs = await fetchBoundChecks({github,owner,repo,checks:checks.check_runs,headSha,trustedWorkflowId:trustedCiWorkflowId}); }
    catch { runs = null; }
  }
  const requiredChecks = verifiedRequiredChecks({runs,totalCount:checks.total_count,
    headSha,requiredNames:["Node tests","PostgreSQL ledger integration"],
    trustedAppId:trustedCiAppId,trustedWorkflowId:trustedCiWorkflowId});
  const ci = {headSha,requiredChecks:requiredChecks || []};
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
      validNumber(trustedReviewerId) && trustedReviewerPublicKey && typeof trustedEvidenceDigestProvider === "function" && typeof trustedKeyStatusProvider === "function") {
    try {
      const challenge=randomBytes(32).toString("hex");
      const scope = Object.freeze({repositoryId:repository.id, issueNumber,prNumber,headSha,challenge});
      const evidenceSha256 = await trustedEvidenceDigestProvider(scope);
      if (typeof evidenceSha256 !== "string" || !/^[a-f0-9]{64}$/.test(evidenceSha256)) throw Error("Missing independent digest");
      const keyScope = Object.freeze({...scope,reviewerId:trustedReviewerId,publicKey:trustedReviewerPublicKey});
      if (await trustedKeyStatusProvider(keyScope) !== 'active') throw Error('Reviewer key unavailable or revoked');
      const evidence = await trustedReviewProvider(scope);
      if (await trustedKeyStatusProvider(keyScope) !== 'active') throw Error('Reviewer key unavailable or revoked');
      const disposition = validateDisposition({envelope:evidence,publicKey:trustedReviewerPublicKey,
        expected:{...scope,reviewerId:trustedReviewerId,evidenceSha256}});
      if (disposition) review = Object.freeze({headSha,status:disposition.status,findings:disposition.findings,independent:true,source:"trusted_review"});
    } catch { review = null; }
  }
  // A ledger records previous failures, not the independently observed current one.
  // Never assume that recurrence is zero when a prior correction exists.
  if (correction?.attempts > 0 && (requiredChecks?.some(c=>["failure","startup_failure"].includes(c.conclusion)) || review?.status==="findings")) {
    try {
      const fingerprint = typeof trustedFailureFingerprintProvider==="function" ? await trustedFailureFingerprintProvider(Object.freeze({repositoryId:repository.id,issueNumber,prNumber,headSha,checks:Object.freeze((requiredChecks||[]).map(c=>Object.freeze({...c}))),review})) : null;
      correction = Object.freeze({...correction,unchangedFailureCount:typeof fingerprint==="string"&&fingerprint.length>=8&&fingerprint.length<=256&&typeof correction.lastFailureFingerprint==="string"?Number(fingerprint===correction.lastFailureFingerprint):null});
    } catch { correction = Object.freeze({...correction,unchangedFailureCount:null}); }
  }
  return evaluatePrSupervision({
    issue: {number: issue.number, state: issue.state, eligible: eligibleIssue(issue)},
    pr: {number: pr.number, state: pr.state, headSha, issueNumber, draft: pr.draft},
    trustedHead, trustedLink, ci,
    review, correction
  });
}
module.exports = {observe, sameRepo, normalizeCheck, eligibleIssue};
