# B02 reviewer acceptance packet — P2-11

Review preparation only; not independent approval. Source revision #21 `6573bee1c668742259beee6768a5f91fc86090d9`; existing ACA CI 45497692213, observer 45497692429, HTTP smoke 45497692543 passed. Source inspected: substantiveDisposition.js, reviewerHttpTransport.js, trustedReviewerProvider.js, reviewerStagingServer.js, githubReviewerAppAuth.js and substantive-disposition.test.js, plus trust-gate document.

| Boundary | Observed source behavior | Independent acceptance question |
|---|---|---|
| Substantive disposition | Exact record fields, repository/issue/PR/head/reviewer/challenge/digest binding, Ed25519 public-only verification, max 120-second validity, consistent findings | Verify canonical reviewed evidence, caller trust, replay and key rotation against protected configuration |
| HTTP transport | Bearer auth, redirect denial, timeout, streamed size limit, JSON validation | Verify trusted endpoint/credential ownership and effective TLS identity |
| Provider | Pinned HTTPS host, no URL userinfo/query/fragment/port, scope validation | Verify independent endpoint and challenge/digest delivery |
| Staging server | /triage advisory only; /review refuses substantive clearance even after matching GitHub approval; process-local admission | Verify no alternative signing path or bypass; distributed ingress and real identity controls remain unaccepted |
| GitHub App | Requests one repository and explicit read-only permissions; validates returned permission and expiry metadata | Verify actual installation scope and protected private-key custody |
| Regression | Synthetic evidence rejects stale scope, challenge replay, legacy approval-only envelopes, wrong keys and private key verification input | Independently review full negative test evidence and missing operational cases |

## Required reviewer disposition
Return exact PR/head, reviewed files and test evidence, each finding with severity and source location, reproduction or reasoning, required remediation, and explicit pass/findings/blocked verdict. Do not infer approval from green CI or conventional GitHub approval. Existing legacy signVerdict helper in staging source is not called by /review; independently verify all call sites and production artifact exclusion before acceptance. No operational signature generated. Do not provision credentials or enable the server.

## Current HOLD
P2-11 is partial development evidence, not independently accepted. P2-12 requires protected immutable artifact, independently pinned key, actual custody and effective permissions; P2-13 requires separately authorized isolated positive/negative acceptance and genuine substantive delivery. No live signer, provider, agent, deployment or migration authorized. CAD $0. B01 gates preserved. B02 integrated candidate manifest is a separate preparation artifact.
