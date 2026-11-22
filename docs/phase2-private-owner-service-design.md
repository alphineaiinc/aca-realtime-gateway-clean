# Phase 2 private owner service — offline infrastructure design and acceptance contract

**Status: design only. No service creation, deployment, database migration, credentials, certificate issuance, reviewer signing or agent dispatch is authorized.**

## Observed constraints
- Render workspace `My Workspace`: existing correction staging and reviewer staging are **public web services**, both Virginia and auto-deploy OFF. The ACA production gateway is a separate public web service in Ohio.
- Neon `alphine-aca-phase2-staging` (`still-cell-80928176`) is in AWS us-east-1 with ready `staging` branch. Database role and network isolation are not attested.
- There is **no private owner-decision service** in the observed Render service inventory. Do not convert the existing reviewer or ACA production service implicitly.

## Proposed isolated service (not created)
| Field | Proposed value / rule |
|---|---|
| Name | `alphine-aca-phase2a-owner-private-staging` |
| Render type | **Private service**, no public URL or internet ingress |
| Region | Virginia, same workspace/region as staging OAuth edge |
| Source | Reviewable approved SHA from `aca-auto-005-offline-correction-simulation`; **never** automatic branch tracking |
| Auto-deploy | OFF |
| Listener | Dedicated private HTTPS/mTLS endpoint; bind to Render-approved private interface only after separate code/security review |
| Route | `POST /phase2a/internal/owner-intent` only; fixed bounded JSON |
| Transport | TLS 1.2+; trusted client CA and pinned edge-client cert; server SAN matching exact private DNS; authenticated server cert on outbound edge |
| Identity | Edge mTLS authenticates the service; Ed25519 signed short-lived owner proof authenticates separately checked owner intent |
| Replay | Atomic shared PostgreSQL nonce claim, exact issuer/audience/repository/owner/request/decision binding |
| Database | Isolated Neon staging only; least-privilege private writer, separate edge reader and nonce roles; repository RLS |
| Logs | Redacted request correlation and outcome; no cookies, OAuth tokens, proof secrets, key material or database credentials |
| Authority | Six flags always false; no Codex dispatch, merge, deploy, reviewer signing or production authorization |

## Important implementation boundary
`phase2aIsolatedMtlsListener.js` currently **forbids non-loopback binds**. This is intentional. Do **not** deploy it as a Render private listener by bypassing that guard. A future separately reviewed private-bind adapter must validate a pinned Render private bind address/port and explicitly reject public exposure, and prove actual private-network reachability. `phase2aPrivateOwnerHttp.js` is unmounted and must not be wired into the ACA production server.

## Offline adversarial acceptance checklist
1. Wrong/no client certificate, wrong CA or certificate fingerprint, hostname/SAN mismatch, and malicious forwarded headers: blocked.
2. Verifier unavailable or throwing: return a bounded denial without leaking details or writing to the database.
3. Wrong HTTP method/path, malformed/oversized JSON, extra authority fields: blocked before any decision mutation.
4. Signed proof with wrong owner/repository/issuer/audience/request/decision, expired timestamp, rotated/revoked key, or reused nonce: blocked.
5. Changed PR head, CI rerun attempt, unavailable GitHub provenance, missing ledger history, or cross-repository database access: blocked.
6. Success returns advisory owner intent only; all six authority flags false.
7. Independent key and certificate rotation, real browser OAuth/CSRF, private DNS, firewall reachability and rollback drill: **operational staging gates**, not satisfied by mocks.
8. Revert/disable feature and revoke credentials without affecting ACA production.

## Approval boundary
The next operational action would be **creation of a dedicated Render private staging service** and isolated staging-only identities, after explicit owner approval of the exact plan. That approval would **not** authorize deployment, merge, reviewer signing or native agent dispatch; each requires separate scope-specific authorization.
