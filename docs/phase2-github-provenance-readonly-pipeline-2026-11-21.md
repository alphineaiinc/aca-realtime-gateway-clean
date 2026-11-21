# Phase 2 GitHub read-only provenance pipeline — 2026-11-21

`src/automation/phase2GithubProvenanceReadOnlyPipeline.js` composes the HTTPS transport, REST adapter and paginated evidence collector. The pipeline accepts trusted server-side GitHub credentials and independently pinned repository/PR/head/workflow/App/check names, performs GET-only calls, validates complete evidence, and **re-fetches the PR head at the end** to detect a head change during collection.

Tests mock the complete HTTPS request path, not the collector API: success-shaped evidence remains NO-GO, and head drift, wrong App, failed workflow, missing credentials and malformed configuration fail closed. No code path issues authorization to merge, deploy, sign or dispatch.

**Not yet live-authenticated:** The mocked HTTPS integration is not proof of an actual GitHub App installation-token request. A real read-only integration requires independently managed installation credentials and trusted check issuer IDs. No tokens were created or stored. Check-suite/run reruns and independent reviewer custody still need operational verification. A final PR-head recheck reduces, but does not eliminate, time-of-check/time-of-use races; operational actions must perform their own atomic/current-head checks.

**Disposition:** Offline integration only; protected PR #27 remains unmerged, no production changes.
