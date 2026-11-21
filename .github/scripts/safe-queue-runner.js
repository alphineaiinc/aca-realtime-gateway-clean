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

async function loadCurrentIssue(github, owner, repo, issueNumber) {
  try {
    const response = await github.rest.issues.get({
      owner,
      repo,
      issue_number: issueNumber,
    });
    if (response?.data?.pull_request) {
      return null;
    }
    return normalizeIssue(response.data);
  } catch (error) {
    if (error.status === 404) {
      return null;
    }
    throw error;
  }
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

async function processIssue(github, owner, repo, issueNumber, core) {
  const issue = await loadCurrentIssue(github, owner, repo, issueNumber);
  if (!issue || String(issue.state || "").toLowerCase() !== "open") {
    return;
  }

  const activeIssueNumbers = (await loadActiveIssueNumbers(github, owner, repo)).filter((number) => number !== issue.number);
  const decision = evaluateSafeQueueDecision({
    issue,
    activeIssueNumbers,
    manualDispatchLogin: "Codex",
  });

  await applyDecision(github, owner, repo, issue, decision, core);
}

async function clearInvalidActiveHolders(github, owner, repo, core) {
  // An issue's unlabeled/unassigned event may be dropped while a newer pending
  // GitHub Actions run replaces it. Reconcile all active holders using live state.
  const holders = await loadOpenIssuesWithLabel(github, owner, repo, LABELS.active);
  for (const holder of holders) {
    const current = await loadCurrentIssue(github, owner, repo, holder.number);
    if (!current || String(current.state || "").toLowerCase() !== "open") {
      await clearQueueLabelsForClosedIssue(github, owner, repo, holder.number);
      core.info(`Removed stale active lock from missing/closed issue #${holder.number}.`);
      continue;
    }
    const stillAllowlisted = current.labels.some(
      (label) => String(label).toLowerCase() === ALLOWLIST_LABEL.toLowerCase()
    );
    const stillAssigned = current.assignees.some(
      (login) => String(login).toLowerCase() === "codex"
    );
    if (!stillAllowlisted || !stillAssigned) {
      // Re-evaluate instead of deleting every status: a valid but unassigned
      // task returns to the queue, while a de-allowlisted task is blocked.
      await processIssue(github, owner, repo, holder.number, core);
      core.info(`Reconciled invalid active lock for issue #${holder.number}.`);
    }
  }
}

async function clearRevokedQueuedCandidates(github, owner, repo, core) {
  // A pending issue event can be replaced by a newer workflow run. Recover
  // revoked queued/eligible tasks even if their unlabeled event never executes.
  const candidates = new Set();
  for (const label of [LABELS.eligible, LABELS.queued, LABELS.manualRequested]) {
    for (const issue of await loadOpenIssuesWithLabel(github, owner, repo, label)) {
      candidates.add(issue.number);
    }
  }

  for (const number of candidates) {
    const current = await loadCurrentIssue(github, owner, repo, number);
    if (!current || String(current.state || "").toLowerCase() !== "open") {
      await clearQueueLabelsForClosedIssue(github, owner, repo, number);
      core.info(`Cleared stale queue labels from missing/closed issue #${number}.`);
      continue;
    }

    if (!current.labels.some((label) => String(label).toLowerCase() === ALLOWLIST_LABEL.toLowerCase())) {
      await processIssue(github, owner, repo, number, core);
      core.info(`Revoked queued eligibility on issue #${number}.`);
    }
  }
}

async function reconcileAllowlistedIssues(github, owner, repo, core) {
  await clearInvalidActiveHolders(github, owner, repo, core);
  await clearRevokedQueuedCandidates(github, owner, repo, core);
  const allowlistedIssues = await loadOpenIssuesWithLabel(github, owner, repo, ALLOWLIST_LABEL);
  if (allowlistedIssues.length === 0) {
    core.info("Reconciliation: no open allowlisted issues.");
    return;
  }

  for (const issue of allowlistedIssues) {
    await processIssue(github, owner, repo, issue.number, core);
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

  const issue = await loadCurrentIssue(github, owner, repo, Number(payloadIssue.number));
  if (!issue) {
    core.info(`Skipping: issue #${payloadIssue.number} no longer exists or is no longer a standard issue.`);
    return;
  }

  if (String(issue.state || "").toLowerCase() !== "open") {
    await clearQueueLabelsForClosedIssue(github, owner, repo, issue.number);
    core.info(`Issue #${issue.number} is closed; queue labels removed.`);
    await reconcileAllowlistedIssues(github, owner, repo, core);
    return;
  }

  await clearInvalidActiveHolders(github, owner, repo, core);
  await processIssue(github, owner, repo, issue.number, core);

  await reconcileAllowlistedIssues(github, owner, repo, core);
}

module.exports = {
  run,
  __private: {
    isTrustedDecisionComment,
    isAutomationMutatedEvent,
    decisionSummaryLines,
    loadCurrentIssue,
    reconcileAllowlistedIssues,
    clearInvalidActiveHolders,
    clearRevokedQueuedCandidates,
  },
};
