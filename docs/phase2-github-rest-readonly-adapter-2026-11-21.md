# Phase 2 read-only GitHub REST adapter — 2026-11-21

Added `src/automation/phase2GithubRestReadOnlyAdapter.js` and adversarial tests.

The adapter pins `https://api.github.com/repos/{trusted-owner}/{trusted-repo}`, builds numeric pagination parameters, requests only GET, declares `redirect: manual`, pins GitHub JSON Accept and API version, and rejects non-200 responses, reported redirects, missing `total_count` and unexpected response structures. It supplies `getPullRequest`, `listCheckRuns` and `listWorkflowRuns` to the existing non-authorizing collector.

**Unresolved external integration:** The injected request function must be backed by a real authenticated GitHub REST client, using server-managed read-only GitHub App installation credentials. The adapter itself does not authenticate, validate TLS peer identity, enforce timeout/byte limits or prevent a dishonest injected transport from following redirects. Those controls require a separately reviewed network transport. No credentials or tokens were created or exposed. The available GitHub connector returns summaries that omit necessary head SHA, App and check-suite fields, so this batch does **not** claim live end-to-end provenance.

**Security follow-ups:** independently pin the correct issuer App ID for each required check (GitHub Actions check issuer is not necessarily the Alphine security-reviewer App); confirm exact current PR head and run attempt, including rerun behavior, before accepting any evidence; maintain zero action authorization.

**Status:** Offline test only; no deployment, merge, reviewer signing or agent dispatch.
