"use strict";

const {
  ALLOWLIST_LABEL,
  evaluateSafeQueueDecision,
} = require("../../src/automation/safeQueuePolicy");

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

async function addLabels(github, owner, repo, issue_number, labels) {
  if (!labels.length) return;
  await github.rest.issues.addLabels({ owner, repo, issue_number, labels });
}

async function removeLabel(github, owner, repo, issue_number, name) {
  try {
    await github.rest.issues.removeLabel({ owner, repo, issue_number, name });
  } catch (error) {
    if (error.status !== 404) throw error;
  }
}

async function removeLabels(github, owner, repo, issue_number, labels) {
  for (const name of labels) {
    await removeLabel(github, owner, repo, issue_number, name);
  }
}

async function loadActiveIssueNumbers(github, owner, repo, currentIssueNumber) {
  const activeIssueNumbers = [];
  const iterator = github.paginate.iterator(github.rest.issues.listForRepo, {
    owner,
    repo,
    state: "open",
    labels: "aca:auto/active",
    per_page: 100,
  });

  for await (const page of iterator) {
    for (const issue of page.data || []) {
      if (issue.pull_request) continue;
      if (Number(issue.number) !== Number(currentIssueNumber)) {
        activeIssueNumbers.push(Number(issue.number));
      }
    }
  }

  return activeIssueNumbers;
}

async function getIssueComments(github, owner, repo, issue_number) {
  return github.paginate(github.rest.issues.listComments, {
    owner,
    repo,
    issue_number,
    per_page: 100,
  });
}

async function ensureDecisionComment(github, owner, repo, issue, decision) {
  const comments = await getIssueComments(github, owner, repo, issue.number);
  const alreadyCommented = comments.some((comment) => String(comment.body || "").includes(decision.marker));
  if (alreadyCommented) {
    return false;
  }

  const summary = [
    decision.marker,
    "### ACA safe queue decision",
    `- Status: \`${decision.status}\``,
    `- Policy version: \`${decision.policyVersion}\``,
    `- Issue allowlist label required: \`${ALLOWLIST_LABEL}\``,
    `- Manual dispatch boundary: this workflow **does not** start native Codex coding tasks. A human must use GitHub UI \"Assign agent\" where available.`,
  ];

  if (decision.reasons.length) {
    summary.push(`- Reasons: ${decision.reasons.map((reason) => `\`${reason}\``).join(", ")}`);
  }

  if (decision.otherActiveIssues.length) {
    summary.push(`- Active lock held by issue(s): ${decision.otherActiveIssues.map((n) => `#${n}`).join(", ")}`);
  }

  await github.rest.issues.createComment({
    owner,
    repo,
    issue_number: issue.number,
    body: `${summary.join("\n")}\n`,
  });

  return true;
}

async function run({ github, context, core }) {
  const issue = context.payload.issue;
  if (!issue || issue.pull_request) {
    core.info("Skipping: event is not a repository issue.");
    return;
  }

  const owner = context.repo.owner;
  const repo = context.repo.repo;

  const knownLabels = [
    ["aca:auto/eligible", "0e8a16", "Eligible for safe automation queue"],
    ["aca:auto/queued", "1d76db", "Queued for guarded manual codex dispatch"],
    ["aca:auto/blocked", "b60205", "Blocked by safe queue policy"],
    ["aca:auto/active", "5319e7", "Single active manual codex task lock"],
    ["aca:auto/manual-dispatch-requested", "fbca04", "Manual codex dispatch requested by assignee"],
    [ALLOWLIST_LABEL, "006b75", "Allowlisted safe automation scope (docs/test proof only)"],
  ];

  for (const [name, color, description] of knownLabels) {
    await ensureLabel(github, owner, repo, name, color, description);
  }

  if (String(issue.state || "").toLowerCase() !== "open") {
    await removeLabels(github, owner, repo, issue.number, [
      "aca:auto/eligible",
      "aca:auto/queued",
      "aca:auto/blocked",
      "aca:auto/active",
      "aca:auto/manual-dispatch-requested",
    ]);
    core.info(`Issue #${issue.number} is closed; queue labels removed.`);
    return;
  }

  const activeIssueNumbers = await loadActiveIssueNumbers(github, owner, repo, issue.number);

  const decision = evaluateSafeQueueDecision({
    issue: {
      number: issue.number,
      state: issue.state,
      isPullRequest: Boolean(issue.pull_request),
      labels: (issue.labels || []).map((label) => (typeof label === "string" ? label : label?.name)),
      assignees: (issue.assignees || []).map((assignee) => assignee?.login),
    },
    activeIssueNumbers,
    manualDispatchLogin: "Codex",
  });

  core.info(`Decision for #${issue.number}: ${decision.code}`);

  if (decision.status === "blocked") {
    await addLabels(github, owner, repo, issue.number, ["aca:auto/blocked"]);
    await removeLabels(github, owner, repo, issue.number, [
      "aca:auto/eligible",
      "aca:auto/queued",
      "aca:auto/manual-dispatch-requested",
      "aca:auto/active",
    ]);
  }

  if (decision.status === "queued") {
    await addLabels(github, owner, repo, issue.number, ["aca:auto/eligible", "aca:auto/queued"]);
    await removeLabels(github, owner, repo, issue.number, [
      "aca:auto/blocked",
      "aca:auto/manual-dispatch-requested",
      "aca:auto/active",
    ]);
  }

  if (decision.status === "manual_dispatch_requested") {
    await addLabels(github, owner, repo, issue.number, [
      "aca:auto/eligible",
      "aca:auto/manual-dispatch-requested",
      "aca:auto/active",
    ]);
    await removeLabels(github, owner, repo, issue.number, ["aca:auto/blocked", "aca:auto/queued"]);
  }

  const created = await ensureDecisionComment(github, owner, repo, issue, decision);
  if (!created) {
    core.info("Decision comment already exists for this idempotency key; skipping comment write.");
  }
}

module.exports = {
  run,
};
