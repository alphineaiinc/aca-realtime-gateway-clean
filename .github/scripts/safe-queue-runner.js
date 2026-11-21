"use strict";

const {
  ALLOWLIST_LABEL,
  LABELS,
  evaluateSafeQueueDecision,
} = require("../../src/automation/safeQueuePolicy");

const TRUSTED_COMMENT_LOGIN = "github-actions[bot]";
const DECISION_HEADING = "### ACA safe queue decision";

function normalizeIssue(issue) {
  return {
    number: Number(issue.number),
    state: issue.state,
    isPullRequest: Boolean(issue.pull_request),
    labels: (issue.labels || []).map((label) => (typeof label === "string" ? label : label?.name)).filter(Boolean),
    assignees: (issue.assignees || []).map((assignee) => assignee?.login).filter(Boolean),
  };
}

function hasLabel(issue, name) {
  const expected = String(name).toLowerCase();
  return (issue.labels || []).some((label) => String(label).toLowerCase() === expected);
}

function hasAssignee(issue, login) {
  const expected = String(login).toLowerCase();
  return (issue.assignees || []).some((assignee) => String(assignee).toLowerCase() === expected);
}

function isAutomationMutatedEvent(payload) {
  const sender = String(payload?.sender?.login || "").toLowerCase();
  if (sender !== TRUSTED_COMMENT_LOGIN.toLowerCase()) {
    return false;
  }

  const action = String(payload?.action || "").toLowerCase();
  if (action === "labeled" || action === "unlabeled") {
    const name = String(payload?.label?.name || "").toLowerCase();
    return name.startsWith("aca:auto/");
  }

  return false;
}

async function ensureLabel(github, owner, repo, name, color, description) {
  try {
    await github.rest.issues.getLabel({ owner, repo, name });
  } catch (error) {
    if (error.status === 404) {
      await github.rest.issues.createLabel({ owner, repo, name, color, description });
      return;
    }
    throw error;
  }
}

async function addLabels(github, owner, repo, issueNumber, labels) {
  if (!labels.length) return;
  await github.rest.issues.addLabels({ owner, repo, issue_number: issueNumber, labels });
}

async function removeLabel(github, owner, repo, issueNumber, name) {
  try {
    await github.rest.issues.removeLabel({ owner, repo, issue_number: issueNumber, name });
  } catch (error) {
    if (error.status !== 404) throw error;
  }
}

async function removeLabels(github, owner, repo, issueNumber, labels) {
  for (const name of labels) {
    await removeLabel(github, owner, repo, issueNumber, name);
  }
}

async function getIssueComments(github, owner, repo, issueNumber) {
  return github.paginate(github.rest.issues.listComments, {
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100,
  });
}

function isTrustedDecisionComment(comment, marker) {
  const body = String(comment?.body || "");
  const author = String(comment?.user?.login || "").toLowerCase();
  return author === TRUSTED_COMMENT_LOGIN.toLowerCase() && body.includes(marker) && body.includes(DECISION_HEADING);
}

function decisionSummaryLines(decision) {
  const summary = [
    decision.marker,
    DECISION_HEADING,
    `- Status: \`${decision.status}\``,
    `- Policy version: \`${decision.policyVersion}\``,
    `- Issue allowlist label required: \`${ALLOWLIST_LABEL}\``,
    "- Manual dispatch boundary: this workflow **does not** start native Codex coding tasks. A human must use GitHub UI \"Assign agent\" where available.",
  ];

  if (decision.reasons.length) {
    summary.push(`- Reasons: ${decision.reasons.map((reason) => `\`${reason}\``).join(", ")}`);
  }

  if (decision.otherActiveIssues.length) {
    summary.push(`- Active lock held by issue(s): ${decision.otherActiveIssues.map((n) => `#${n}`).join(", ")}`);
  }

  return summary;
}

async function ensureDecisionComment(github, owner, repo, issueNumber, decision) {
  const comments = await getIssueComments(github, owner, repo, issueNumber);
  const alreadyCommented = comments.some((comment) => isTrustedDecisionComment(comment, decision.marker));
  if (alreadyCommented) {
    return false;
  }

  await github.rest.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body: `${decisionSummaryLines(decision).join("\n")}\n`,
  });

  return true;
}

async function loadOpenIssuesWithLabel(github, owner, repo, label) {
  const openIssues = [];
  const iterator = github.paginate.iterator(github.rest.issues.listForRepo, {
    owner,
    repo,
    state: "open",
    labels: label,
    per_page: 100,
  });

  for await (const page of iterator) {
    for (const issue of page.data || []) {
      if (!issue.pull_request) {
        openIssues.push(normalizeIssue(issue));
      }
    }
  }

  openIssues.sort((a, b) => a.number - b.number);
  return openIssues;
}

async function loadActiveIssueNumbers(github, owner, repo) {
  return (await loadOpenIssuesWithLabel(github, owner, repo, LABELS.active)).map((issue) => issue.number);
}

async function clearQueueLabelsForClosedIssue(github, owner, repo, issueNumber) {
  await removeLabels(github, owner, repo, issueNumber, [
    LABELS.eligible,
    LABELS.queued,
    LABELS.blocked,
    LABELS.active,
    LABELS.manualRequested,
  ]);
}

async function applyDecision(github, owner, repo, issue, decision, core) {
  core.info(`Decision for #${issue.number}: ${decision.code}`);

  if (decision.status === "blocked") {
    await addLabels(github, owner, repo, issue.number, [LABELS.blocked]);
    await removeLabels(github, owner, repo, issue.number, [
      LABELS.eligible,
      LABELS.queued,
      LABELS.manualRequested,
      LABELS.active,
    ]);
  }

  if (decision.status === "queued") {
    await addLabels(github, owner, repo, issue.number, [LABELS.eligible, LABELS.queued]);
    await removeLabels(github, owner, repo, issue.number, [
      LABELS.blocked,
      LABELS.manualRequested,
      LABELS.active,
    ]);
  }

  if (decision.status === "manual_dispatch_requested") {
    await addLabels(github, owner, repo, issue.number, [
      LABELS.eligible,
      LABELS.manualRequested,
      LABELS.active,
    ]);
    await removeLabels(github, owner, repo, issue.number, [LABELS.blocked, LABELS.queued]);
  }

  const created = await ensureDecisionComment(github, owner, repo, issue.number, decision);
  if (!created) {
    core.info(`Decision comment already exists for trusted idempotency key on #${issue.number}; skipping comment write.`);
  }
}

async function processIssue(github, owner, repo, issue, activeIssueNumbers, core) {
  const decision = evaluateSafeQueueDecision({
    issue,
    activeIssueNumbers,
    manualDispatchLogin: "Codex",
  });

  await applyDecision(github, owner, repo, issue, decision, core);
}

function selectPinnedActiveIssue(allowlistedIssues) {
  const currentlyActive = allowlistedIssues.filter((issue) => hasLabel(issue, LABELS.active) && hasAssignee(issue, "Codex"));
  if (currentlyActive.length > 0) {
    return currentlyActive[0].number;
  }

  const firstManualRequested = allowlistedIssues.find((issue) => hasAssignee(issue, "Codex"));
  return firstManualRequested ? firstManualRequested.number : null;
}

async function reconcileAllowlistedIssues(github, owner, repo, core) {
  const allowlistedIssues = await loadOpenIssuesWithLabel(github, owner, repo, ALLOWLIST_LABEL);
  if (allowlistedIssues.length === 0) {
    core.info("Reconciliation: no open allowlisted issues.");
    return;
  }

  const pinnedActive = selectPinnedActiveIssue(allowlistedIssues);

  for (const issue of allowlistedIssues) {
    const activeIssueNumbers = pinnedActive && pinnedActive !== issue.number ? [pinnedActive] : [];
    await processIssue(github, owner, repo, issue, activeIssueNumbers, core);
  }
}

async function run({ github, context, core }) {
  const payloadIssue = context.payload.issue;
  if (!payloadIssue || payloadIssue.pull_request) {
    core.info("Skipping: event is not a repository issue.");
    return;
  }

  if (isAutomationMutatedEvent(context.payload)) {
    core.info("Skipping automation-generated queue label event to prevent self-trigger loops.");
    return;
  }

  const owner = context.repo.owner;
  const repo = context.repo.repo;

  const knownLabels = [
    [LABELS.eligible, "0e8a16", "Eligible for safe automation queue"],
    [LABELS.queued, "1d76db", "Queued for guarded manual codex dispatch"],
    [LABELS.blocked, "b60205", "Blocked by safe queue policy"],
    [LABELS.active, "5319e7", "Single active manual codex task lock"],
    [LABELS.manualRequested, "fbca04", "Manual codex dispatch requested by assignee"],
    [ALLOWLIST_LABEL, "006b75", "Allowlisted safe automation scope (docs/test proof only)"],
  ];

  for (const [name, color, description] of knownLabels) {
    await ensureLabel(github, owner, repo, name, color, description);
  }

  const issue = normalizeIssue(payloadIssue);

  if (String(issue.state || "").toLowerCase() !== "open") {
    await clearQueueLabelsForClosedIssue(github, owner, repo, issue.number);
    core.info(`Issue #${issue.number} is closed; queue labels removed.`);
    await reconcileAllowlistedIssues(github, owner, repo, core);
    return;
  }

  const activeIssueNumbers = (await loadActiveIssueNumbers(github, owner, repo)).filter((number) => number !== issue.number);
  await processIssue(github, owner, repo, issue, activeIssueNumbers, core);

  await reconcileAllowlistedIssues(github, owner, repo, core);
}

module.exports = {
  run,
  __private: {
    isTrustedDecisionComment,
    isAutomationMutatedEvent,
    decisionSummaryLines,
    reconcileAllowlistedIssues,
  },
};
