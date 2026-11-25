# ACA Phase 2: conservative PR security patch triage

This module is **not an independent code-review engine** and **cannot issue approvals**. It is a narrow triage stage before a separately authenticated reviewer makes a real security decision.

- `src/automation/prSecurityPatchTriage.js` examines a strictly bounded list of GitHub PR file patches, identifies some risky added lines, and flags protected surfaces and deletions for manual security review.
- An ordinary clean diff returns `manual_review_required`, not `passed`. Risky changes return `findings`; missing/incomplete evidence returns `blocked`. Every result has `independent:false`.
- A stable patch digest binds the triage result to supplied file contents. The caller must independently bind the repository, PR number and head commit using authenticated GitHub APIs, verify complete pagination, and reject forks and changed heads.
- The scanner is heuristic, and does not detect every vulnerability. It does not execute untrusted changes, read private credentials, call the GitHub review submission API, issue Ed25519 signatures, or authorize merging or deployment.
- Do **not** adapt `manual_review_required` into an independent review `passed`; `verifySignedReview` still requires a verified signed verdict from an independently trusted signing service.
- Operational integration is pending: a separate review-performing service/actor, independent audit and pinned deployment, protected runtime secrets, GitHub installation token verification and actual review findings.
