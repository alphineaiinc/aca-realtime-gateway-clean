"use strict";

const POLICY_VERSION = "v1";
const ALLOWLIST_LABEL = "aca:auto/docs-test";
const LABELS = Object.freeze({
  queued: "aca:auto/queued",
  blocked: "aca:auto/blocked",
  eligible: "aca:auto/eligible",
  active: "aca:auto/active",
  manualRequested: "aca:auto/manual-dispatch-requested",
});

function normalizeLabelSet(labels) {
  return new Set((labels || []).map((label) => String(label).toLowerCase()));
}

function issueAssigneesContain(assignees, login) {
  const normalized = String(login || "").toLowerCase();
  return (assignees || []).some((assignee) => String(assignee || "").toLowerCase() === normalized);
}

function decisionCode(status, reasons) {
  return `${status}:${(reasons || []).join("+") || "none"}`;
}

function decisionMarker(issueNumber, code) {
  return `<!-- aca-auto-queue:${POLICY_VERSION}:${issueNumber}:${code} -->`;
}

function evaluateSafeQueueDecision(input) {
  const issue = input?.issue || {};
  const labels = normalizeLabelSet(issue.labels);
  const reasons = [];

  if (issue.isPullRequest) {
    reasons.push("pull_request_not_supported");
  }
  if (String(issue.state || "").toLowerCase() !== "open") {
    reasons.push("issue_not_open");
  }

  const allowlisted = labels.has(ALLOWLIST_LABEL);
  if (!allowlisted) {
    reasons.push("not_allowlisted");
  }

  const activeIssues = Array.isArray(input?.activeIssueNumbers) ? input.activeIssueNumbers : [];
  const currentIssue = Number(issue.number);
  const otherActiveIssues = activeIssues.filter((number) => Number(number) !== currentIssue);
  if (otherActiveIssues.length > 0) {
    reasons.push("active_issue_lock");
  }

  const manualDispatchRequested = issueAssigneesContain(issue.assignees, input?.manualDispatchLogin || "Codex");

  let status = "blocked";
  if (reasons.length === 0) {
    status = manualDispatchRequested ? "manual_dispatch_requested" : "queued";
  }

  const code = decisionCode(status, reasons);

  return {
    policyVersion: POLICY_VERSION,
    status,
    reasons,
    code,
    marker: decisionMarker(issue.number, code),
    allowlisted,
    otherActiveIssues,
    manualDispatchRequested,
    labels: LABELS,
  };
}

module.exports = {
  ALLOWLIST_LABEL,
  LABELS,
  POLICY_VERSION,
  decisionMarker,
  evaluateSafeQueueDecision,
};
