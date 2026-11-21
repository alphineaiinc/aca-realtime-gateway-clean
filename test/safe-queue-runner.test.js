"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  ALLOWLIST_LABEL,
  LABELS,
  evaluateSafeQueueDecision,
} = require("../src/automation/safeQueuePolicy");
const { run } = require("../.github/scripts/safe-queue-runner");

function createIssue(number, { state = "open", labels = [], assignees = [], comments = [] } = {}) {
  return {
    number,
    state,
    labels: [...labels],
    assignees: [...assignees],
    comments: [...comments],
    pull_request: null,
  };
}

function asApiIssue(issue) {
  return {
    number: issue.number,
    state: issue.state,
    labels: issue.labels.map((name) => ({ name })),
    assignees: issue.assignees.map((login) => ({ login })),
    pull_request: issue.pull_request,
  };
}

function hasLabel(issue, label) {
  return issue.labels.includes(label);
}

function createMockGithub(initialIssues) {
  const issues = new Map(initialIssues.map((issue) => [issue.number, issue]));
  const labelStore = new Set();
  const calls = { createComment: 0 };

  const rest = {
    issues: {
      async getLabel({ name }) {
        if (!labelStore.has(name)) {
          const error = new Error("not found");
          error.status = 404;
          throw error;
        }
        return { data: { name } };
      },
      async createLabel({ name }) {
        labelStore.add(name);
        return { data: { name } };
      },
      async addLabels({ issue_number, labels }) {
        const issue = issues.get(issue_number);
        for (const label of labels) {
          if (!issue.labels.includes(label)) {
            issue.labels.push(label);
          }
        }
        return { data: asApiIssue(issue) };
      },
      async removeLabel({ issue_number, name }) {
        const issue = issues.get(issue_number);
        const idx = issue.labels.indexOf(name);
        if (idx < 0) {
          const error = new Error("not found");
          error.status = 404;
          throw error;
        }
        issue.labels.splice(idx, 1);
        return { data: asApiIssue(issue) };
      },
      async listForRepo({ state, labels }) {
        const list = [...issues.values()].filter((issue) => {
          if (state && issue.state !== state) return false;
          if (labels && !issue.labels.includes(labels)) return false;
          return !issue.pull_request;
        }).map((issue) => asApiIssue(issue));
        return { data: list };
      },
      async get({ issue_number }) {
        const issue = issues.get(issue_number);
        if (!issue) {
          const error = new Error("not found");
          error.status = 404;
          throw error;
        }
        return { data: asApiIssue(issue) };
      },
      async listComments({ issue_number }) {
        const issue = issues.get(issue_number);
        return { data: issue.comments.map((comment) => ({ ...comment })) };
      },
      async createComment({ issue_number, body }) {
        const issue = issues.get(issue_number);
        issue.comments.push({ body, user: { login: "github-actions[bot]" } });
        calls.createComment += 1;
        return { data: issue.comments[issue.comments.length - 1] };
      },
    },
  };

  const paginate = async (fn, params) => {
    const result = await fn(params);
    return result.data;
  };
  paginate.iterator = async function* iterator(fn, params) {
    yield await fn(params);
  };

  return { github: { rest, paginate }, issues, calls };
}

function contextFor(issue, action = "assigned", payloadIssueOverride) {
  return {
    repo: { owner: "alphineaiinc", repo: "aca-realtime-gateway-clean" },
    payload: {
      action,
      issue: payloadIssueOverride || asApiIssue(issue),
      sender: { login: "alphineaiinc" },
    },
  };
}

function coreLogger() {
  return { info() {} };
}

test("creates trusted audit comment when marker was spoofed by non-bot author", async () => {
  const decision = evaluateSafeQueueDecision({
    issue: { number: 41, state: "open", labels: [ALLOWLIST_LABEL], assignees: [] },
    activeIssueNumbers: [],
    manualDispatchLogin: "Codex",
  });

  const issue = createIssue(41, {
    labels: [ALLOWLIST_LABEL],
    comments: [{ body: `${decision.marker}\nspoof`, user: { login: "random-user" } }],
  });

  const mock = createMockGithub([issue]);
  await run({ github: mock.github, context: contextFor(issue, "opened"), core: coreLogger() });

  assert.equal(mock.calls.createComment > 0, true);
  const trustedComments = mock.issues.get(41).comments.filter((comment) => comment.user.login === "github-actions[bot]");
  assert.equal(trustedComments.length >= 1, true);
  assert.equal(trustedComments.some((comment) => comment.body.includes(decision.marker)), true);
});

test("does not duplicate decision comment when trusted marker already exists", async () => {
  const decision = evaluateSafeQueueDecision({
    issue: { number: 42, state: "open", labels: [ALLOWLIST_LABEL], assignees: [] },
    activeIssueNumbers: [],
    manualDispatchLogin: "Codex",
  });

  const issue = createIssue(42, {
    labels: [ALLOWLIST_LABEL],
    comments: [{ body: `${decision.marker}\n### ACA safe queue decision`, user: { login: "github-actions[bot]" } }],
  });

  const mock = createMockGithub([issue]);
  await run({ github: mock.github, context: contextFor(issue, "opened"), core: coreLogger() });

  assert.equal(mock.calls.createComment, 0);
});

test("reconciliation promotes task B after active task A closes without manual B edits", async () => {
  const issueA = createIssue(51, {
    labels: [ALLOWLIST_LABEL, LABELS.active, LABELS.manualRequested, LABELS.eligible],
    assignees: ["Codex"],
  });
  const issueB = createIssue(52, {
    labels: [ALLOWLIST_LABEL, LABELS.blocked],
    assignees: ["Codex"],
  });

  const mock = createMockGithub([issueA, issueB]);

  await run({ github: mock.github, context: contextFor(issueB, "assigned"), core: coreLogger() });
  assert.equal(hasLabel(mock.issues.get(52), LABELS.blocked), true);

  mock.issues.get(51).state = "closed";
  await run({
    github: mock.github,
    context: {
      ...contextFor(mock.issues.get(51), "closed"),
      payload: {
        ...contextFor(mock.issues.get(51), "closed").payload,
        sender: { login: "alphineaiinc" },
      },
    },
    core: coreLogger(),
  });

  const updatedB = mock.issues.get(52);
  assert.equal(hasLabel(updatedB, LABELS.active), true);
  assert.equal(hasLabel(updatedB, LABELS.manualRequested), true);
  assert.equal(hasLabel(updatedB, LABELS.blocked), false);
});

test("serialized two-issue assignment results in single active holder and blocked peer", async () => {
  const issueA = createIssue(61, {
    labels: [ALLOWLIST_LABEL],
    assignees: ["Codex"],
  });
  const issueB = createIssue(62, {
    labels: [ALLOWLIST_LABEL],
    assignees: ["Codex"],
  });

  const mock = createMockGithub([issueA, issueB]);

  await run({ github: mock.github, context: contextFor(issueA, "assigned"), core: coreLogger() });
  await run({ github: mock.github, context: contextFor(issueB, "assigned"), core: coreLogger() });

  const a = mock.issues.get(61);
  const b = mock.issues.get(62);

  assert.equal(hasLabel(a, LABELS.active), true);
  assert.equal(hasLabel(a, LABELS.manualRequested), true);
  assert.equal(hasLabel(b, LABELS.blocked), true);
  assert.equal(hasLabel(b, LABELS.active), false);
});

test("uses live issue state when allowlist was removed while queued", async () => {
  const issue = createIssue(71, {
    labels: [LABELS.queued, LABELS.eligible],
    assignees: ["Codex"],
  });
  const stalePayloadIssue = asApiIssue({
    ...issue,
    labels: [ALLOWLIST_LABEL, LABELS.queued, LABELS.eligible],
  });

  const mock = createMockGithub([issue]);
  await run({
    github: mock.github,
    context: contextFor(issue, "assigned", stalePayloadIssue),
    core: coreLogger(),
  });

  const updated = mock.issues.get(71);
  assert.equal(hasLabel(updated, ALLOWLIST_LABEL), false);
  assert.equal(hasLabel(updated, LABELS.blocked), true);
  assert.equal(hasLabel(updated, LABELS.queued), false);
  assert.equal(hasLabel(updated, LABELS.active), false);
});

test("uses live issue state when codex assignee was removed before execution", async () => {
  const issue = createIssue(72, {
    labels: [ALLOWLIST_LABEL, LABELS.active, LABELS.manualRequested, LABELS.eligible],
    assignees: [],
  });
  const stalePayloadIssue = asApiIssue({
    ...issue,
    assignees: ["Codex"],
  });

  const mock = createMockGithub([issue]);
  await run({
    github: mock.github,
    context: contextFor(issue, "assigned", stalePayloadIssue),
    core: coreLogger(),
  });

  const updated = mock.issues.get(72);
  assert.equal(hasLabel(updated, LABELS.active), false);
  assert.equal(hasLabel(updated, LABELS.manualRequested), false);
  assert.equal(hasLabel(updated, LABELS.queued), true);
});

test("uses live issue state when issue closed while event waited", async () => {
  const issue = createIssue(73, {
    state: "closed",
    labels: [ALLOWLIST_LABEL, LABELS.active, LABELS.manualRequested, LABELS.eligible, LABELS.queued],
    assignees: ["Codex"],
  });
  const stalePayloadIssue = asApiIssue({
    ...issue,
    state: "open",
  });

  const mock = createMockGithub([issue]);
  await run({
    github: mock.github,
    context: contextFor(issue, "assigned", stalePayloadIssue),
    core: coreLogger(),
  });

  const updated = mock.issues.get(73);
  assert.equal(hasLabel(updated, LABELS.active), false);
  assert.equal(hasLabel(updated, LABELS.manualRequested), false);
  assert.equal(hasLabel(updated, LABELS.eligible), false);
  assert.equal(hasLabel(updated, LABELS.queued), false);
  assert.equal(hasLabel(updated, LABELS.blocked), false);
});

test("two-issue stale interleaving keeps a single live active holder", async () => {
  const issueA = createIssue(81, {
    labels: [ALLOWLIST_LABEL, LABELS.active, LABELS.manualRequested, LABELS.eligible],
    assignees: ["Codex"],
  });
  const issueB = createIssue(82, {
    labels: [LABELS.queued, LABELS.eligible],
    assignees: [],
  });
  const stalePayloadIssueB = asApiIssue({
    ...issueB,
    labels: [ALLOWLIST_LABEL, LABELS.queued, LABELS.eligible],
    assignees: ["Codex"],
  });

  const mock = createMockGithub([issueA, issueB]);
  await run({
    github: mock.github,
    context: contextFor(issueB, "assigned", stalePayloadIssueB),
    core: coreLogger(),
  });

  const a = mock.issues.get(81);
  const b = mock.issues.get(82);
  assert.equal(hasLabel(a, LABELS.active), true);
  assert.equal(hasLabel(b, LABELS.active), false);
  assert.equal(hasLabel(b, LABELS.manualRequested), false);
  assert.equal(hasLabel(b, LABELS.blocked), true);
});
