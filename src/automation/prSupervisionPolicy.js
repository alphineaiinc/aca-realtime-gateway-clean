"use strict";

/**
 * Phase 2 PR supervisor decision core.
 *
 * This module performs NO network calls or GitHub mutations. Callers must supply
 * verified, current-head evidence from trusted GitHub APIs. All missing,
 * inconsistent or stale evidence fails closed. No Codex dispatch is inferred.
 */
const POLICY_VERSION = "phase2-v1";
const MAX_CORRECTIONS = 2;
const STATES = Object.freeze({
  UNLINKED: "unlinked",
  AWAITING_DISPATCH: "awaiting_manual_dispatch",
  AWAITING_PR: "awaiting_pr",
  CI_PENDING: "ci_pending",
  CI_FAILED: "ci_failed",
  REVIEW_PENDING: "review_pending",
  CORRECTION_NEEDED: "correction_needed",
  BLOCKED: "blocked",
  READY: "ready_for_human_approval",
  CLOSED: "closed",
});

function nonempty(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function safeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}
function normalize(value) {
  return String(value || "").toLowerCase();
}
function hasCurrentHeadEvidence(evidence, headSha) {
  return Boolean(evidence && nonempty(evidence.headSha) && evidence.headSha === headSha);
}
function normalizeStatus(value) {
  return normalize(value).replace(/\s+/g, "_");
}
function report(state, reasons, context, correction = { allowed: false, remaining: 0 }) {
  const prNumber = context.prNumber ?? null;
  const headSha = context.headSha ?? null;
  return Object.freeze({
    policyVersion: POLICY_VERSION,
    state,
    reasons: Object.freeze([...new Set(reasons)]),
    prNumber,
    headSha,
    correction: Object.freeze(correction),
    // Always advisory. Never infer agent dispatch or permission to merge.
    manualDispatchRequired: true,
    mergeAuthorized: false,
    deployAuthorized: false,
  });
}

/**
 * Evidence contract:
 * {issue:{number,state,eligible}, pr:{number,state,headSha,draft,issueNumber},
 *  ci:{headSha,requiredChecks:[{name,status,conclusion,headSha}]},
 *  review:{headSha,status,findings,independent,source},
 *  correction:{attempts,unchangedFailureCount}}
 *
 * The caller must authenticate source identities, verify required check names,
 * avoid interpreting PR text as reviewer verdict, and fetch GitHub state live.
 */
function evaluatePrSupervision(input = {}) {
  const issue = input.issue || {};
  const pr = input.pr || null;
  const ctx = {prNumber: pr?.number, headSha: pr?.headSha};
  if (!safeInteger(issue.number) || issue.number === 0 ||
      !nonempty(issue.state) || typeof issue.eligible !== "boolean") {
    return report(STATES.BLOCKED, ["invalid_issue_evidence"], ctx);
  }
  if (normalize(issue.state) !== "open" || !issue.eligible) {
    return report(STATES.BLOCKED, ["issue_ineligible"], ctx);
  }
  if (!pr) return report(STATES.AWAITING_PR, ["no_linked_pr"], ctx);
  if (!safeInteger(pr.number) || pr.number === 0 || !nonempty(pr.headSha) ||
      !nonempty(pr.state) || !safeInteger(pr.issueNumber) ||
      pr.issueNumber !== issue.number || typeof pr.draft !== "boolean") {
    return report(STATES.BLOCKED, ["invalid_pr_evidence"], ctx);
  }
  if (normalize(pr.state) === "closed" || normalize(pr.state) === "merged") {
    return report(STATES.CLOSED, ["pr_closed"], ctx);
  }
  if (normalize(pr.state) !== "open") {
    return report(STATES.BLOCKED, ["invalid_pr_state"], ctx);
  }
  if (pr.draft) return report(STATES.BLOCKED, ["draft_pr"], ctx);
  if (input.trustedHead !== true || input.trustedLink !== true) {
    return report(STATES.BLOCKED, ["unverified_pr_link_or_head"], ctx);
  }

  const correction = input.correction || {};
  if (!safeInteger(correction.attempts) ||
      !safeInteger(correction.unchangedFailureCount)) {
    return report(STATES.BLOCKED, ["unknown_correction_history"], ctx);
  }
  const remaining = Math.max(0, MAX_CORRECTIONS - correction.attempts);
  if (correction.attempts > MAX_CORRECTIONS) {
    return report(STATES.BLOCKED, ["correction_budget_exceeded"], ctx);
  }

  const ci = input.ci;
  if (!hasCurrentHeadEvidence(ci, pr.headSha) ||
      !Array.isArray(ci.requiredChecks) || ci.requiredChecks.length === 0) {
    return report(STATES.CI_PENDING, ["missing_current_head_ci"], ctx);
  }
  const names = new Set();
  for (const check of ci.requiredChecks) {
    if (!nonempty(check?.name) || names.has(check.name) ||
        !hasCurrentHeadEvidence(check, pr.headSha) ||
        !nonempty(check.status) || !nonempty(check.conclusion)) {
      return report(STATES.BLOCKED, ["ambiguous_or_stale_ci_checks"], ctx);
    }
    names.add(check.name);
  }
  const pending = ci.requiredChecks.some((check) =>
    normalizeStatus(check.status) !== "completed" ||
    ["", "pending", "queued", "in_progress", "neutral", "skipped", "cancelled",
      "timed_out", "action_required"].includes(normalizeStatus(check.conclusion)));
  const failed = ci.requiredChecks.some((check) =>
    ["failure", "startup_failure"].includes(normalizeStatus(check.conclusion)));
  const unknown = ci.requiredChecks.some((check) =>
    !["success", "failure", "startup_failure", "cancelled", "skipped", "neutral",
      "timed_out", "action_required"].includes(normalizeStatus(check.conclusion)));
  if (unknown) return report(STATES.BLOCKED, ["unknown_ci_conclusion"], ctx);
  if (failed) {
    const exhausted = remaining === 0 || correction.unchangedFailureCount > 0;
    return report(exhausted ? STATES.BLOCKED : STATES.CI_FAILED,
      [exhausted ? "correction_escalation_required" : "ci_failure"],
      ctx, {allowed: !exhausted, remaining});
  }
  if (pending) return report(STATES.CI_PENDING, ["ci_not_successful"], ctx);
  const review = input.review;
  if (!hasCurrentHeadEvidence(review, pr.headSha) ||
      !nonempty(review.status) || review.independent !== true ||
      review.source !== "trusted_review") {
    return report(STATES.REVIEW_PENDING, ["missing_trusted_current_head_review"], ctx);
  }
  const reviewStatus = normalizeStatus(review.status);
  if (reviewStatus === "pending") {
    return report(STATES.REVIEW_PENDING, ["review_in_progress"], ctx);
  }
  if (reviewStatus === "blocked") {
    return report(STATES.BLOCKED, ["review_blocked"], ctx);
  }
  if (reviewStatus === "findings") {
    if (!safeInteger(review.findings) || review.findings === 0) {
      return report(STATES.BLOCKED, ["invalid_review_findings"], ctx);
    }
    const exhausted = remaining === 0 || correction.unchangedFailureCount > 0;
    return report(exhausted ? STATES.BLOCKED : STATES.CORRECTION_NEEDED,
      [exhausted ? "correction_escalation_required" : "review_findings"],
      ctx, {allowed: !exhausted, remaining});
  }
  if (reviewStatus !== "passed" || review.findings !== 0) {
    return report(STATES.BLOCKED, ["ambiguous_review_verdict"], ctx);
  }
  return report(STATES.READY, ["ci_and_independent_review_passed"], ctx);
}

module.exports = {POLICY_VERSION, MAX_CORRECTIONS, STATES, evaluatePrSupervision};
