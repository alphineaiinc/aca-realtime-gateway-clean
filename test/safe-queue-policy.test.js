"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  ALLOWLIST_LABEL,
  evaluateSafeQueueDecision,
} = require("../src/automation/safeQueuePolicy");

test("safe queue blocks non-allowlisted issues", () => {
  const decision = evaluateSafeQueueDecision({
    issue: {
      number: 14,
      state: "open",
      labels: ["bug"],
      assignees: [],
    },
    activeIssueNumbers: [],
    manualDispatchLogin: "Codex",
  });

  assert.equal(decision.status, "blocked");
  assert.deepEqual(decision.reasons, ["not_allowlisted"]);
  assert.ok(decision.marker.includes("14"));
});

test("safe queue sets queued status for allowlisted issue without active lock", () => {
  const decision = evaluateSafeQueueDecision({
    issue: {
      number: 21,
      state: "open",
      labels: [ALLOWLIST_LABEL],
      assignees: [],
    },
    activeIssueNumbers: [],
    manualDispatchLogin: "Codex",
  });

  assert.equal(decision.status, "queued");
  assert.deepEqual(decision.reasons, []);
  assert.equal(decision.manualDispatchRequested, false);
});

test("safe queue enforces single active lock", () => {
  const decision = evaluateSafeQueueDecision({
    issue: {
      number: 30,
      state: "open",
      labels: [ALLOWLIST_LABEL],
      assignees: [],
    },
    activeIssueNumbers: [29],
    manualDispatchLogin: "Codex",
  });

  assert.equal(decision.status, "blocked");
  assert.deepEqual(decision.reasons, ["active_issue_lock"]);
  assert.deepEqual(decision.otherActiveIssues, [29]);
});

test("safe queue records manual dispatch request but does not claim native dispatch", () => {
  const decision = evaluateSafeQueueDecision({
    issue: {
      number: 35,
      state: "open",
      labels: [ALLOWLIST_LABEL],
      assignees: ["Codex"],
    },
    activeIssueNumbers: [],
    manualDispatchLogin: "Codex",
  });

  assert.equal(decision.status, "manual_dispatch_requested");
  assert.deepEqual(decision.reasons, []);
  assert.equal(decision.manualDispatchRequested, true);
});

test("safe queue fail-closed when issue is closed", () => {
  const decision = evaluateSafeQueueDecision({
    issue: {
      number: 44,
      state: "closed",
      labels: [ALLOWLIST_LABEL],
      assignees: ["Codex"],
    },
    activeIssueNumbers: [],
    manualDispatchLogin: "Codex",
  });

  assert.equal(decision.status, "blocked");
  assert.deepEqual(decision.reasons, ["issue_not_open"]);
});
