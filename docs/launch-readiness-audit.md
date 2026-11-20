# Launch-Readiness Audit (ACA-AUDIT-001)

## 1) Executive verdict

### What we can demonstrate today (VERIFIED)
- A Node/Express call-attendant codebase exists with Twilio voice webhook + media-stream handling, chat APIs, partner/billing routes, and migration artifacts.
- CI foundations exist (`ACA CI`) with a single `Node tests` job and human-approval language in repository governance docs.
- A minimum local test baseline currently passes in this workspace:
  - `node --test test/*.test.js` -> `9 passed, 0 failed`
  - `git ls-files -z '*.js' | grep -zv '^node_modules/' | xargs -0 -r -n 1 node --check` -> exited `0`
- Draft PR #2 (`ACA-029`) contains substantial hardening work, but it is unmerged/unreleased.

### What we cannot demonstrate today (UNVERIFIED)
- We cannot demonstrate staging-verified or production-verified Twilio call quality, retry semantics, stream reliability, or multi-tenant safety under live load.
- We cannot demonstrate full launch readiness for a generic multi-industry paying customer because key controls are partial/inconsistent on `main` (tenant defaults, webhook trust/signature controls, privacy-safe logging boundaries, secrets hygiene).
- We cannot demonstrate complete historical backlog coverage from visible issues alone.

### Overall decision
- Current `main` state is **not production-ready** for a first paying customer without additional hardening and staging validation.
- There is a plausible shortest path to a commercially usable pilot if work is focused on security/privacy/tenant-routing correctness and end-to-end staging evidence first.

## Status legend used in this report
- `VERIFIED`: Directly evidenced by repository files, GitHub metadata, and/or commands executed in this audit.
- `IMPLEMENTED-UNVERIFIED`: Code exists, but no adequate validation evidence for launch claims.
- `PARTIAL`: Some implementation exists, but with material gaps or contradictions.
- `MISSING`: No evidence of required implementation in accessible scope.
- `UNKNOWN`: Could exist outside accessible evidence; cannot be confirmed.

## 2) Architecture inventory and source-of-truth map

### Runtime entrypoints and composition
- `package.json` -> `main: index.js`, `scripts.start: node index.js`.
- `index.js` builds Express + HTTP server, mounts REST and WS routes, and listens on `PORT || 8080`.
- Twilio routing is mounted via `app.use('/twilio', twilioRouter)` and WS media route `/ws/twilio-stream` delegates to `handleTwilioStream`.

### Core voice stack
- Voice webhook/status handlers: `src/routes/twilio.js`.
- Voice orchestration pipeline: `src/voice/sessionController.js` + `workflowExtractor.js` + `workflowStateEngine.js` + `workflowReplyComposer.js` + `slotEnforcement.js`.
- STT: Google Speech streaming in `src/brain/utils/sttGoogle.js`.
- TTS: `tts.js` (OpenAI default, ElevenLabs optional path).

### Tenant and auth surfaces
- Tenant resolver: `src/voice/tenantResolver.js`.
- Brain route with JWT-based tenant checks: `src/routes/brain.js`.
- Admin monitor protection middleware in `index.js` (`requireAdmin`) used for selected monitor endpoints.
- Tenant provisioning/login: `src/routes/tenant.js` (mounted under `/tenant`).
- Partner auth middleware: `src/auth/partnerAuth.js`.

### Data and schema artifacts
- Core schema bootstrap: `migrations/001_core_schema.sql`.
- Tenant isolation hardening migration: `migrations/003_tenant_isolation_hardening.sql`.
- Tenant metadata columns: `migrations/004_add_tenant_columns.sql`.
- Billing/analytics migrations: `migrations/004_billing_invoices.sql`, `005_billing_payments.sql`, `006_billing_stats.sql`, `006_create_analytics_events.sql`.

### CI and governance
- CI workflow: `.github/workflows/ci.yml` (`ACA CI`, `Node tests`).
- PR approval template: `.github/pull_request_template.md`.
- Agent governance constraints: `AGENTS.md`.

## 3) Capability matrix (main vs draft PR #2)

| Feature | Main (`122a426`) | Draft PR #2 (`f1eee70` head, unmerged) | Evidence | Missing validation | Launch impact |
|---|---|---|---|---|---|
| Twilio voice webhook + stream wiring | `IMPLEMENTED-UNVERIFIED` | `IMPLEMENTED-UNVERIFIED` with hardening claims | `src/routes/twilio.js`, `index.js`; PR #2 commits (`5d6b96e`..`f1eee70`) | No live staging call evidence | P0 |
| Twilio signature/callback verification | `PARTIAL` (webhooks/status accept GET+POST; no signature validation in current main handler) | Claimed hardened in PR #2 but unreleased | `src/routes/twilio.js` lines around `handleVoiceWebhook`, `/status`, `/stream-status`; PR #2 description/commits | Staging verification of signed callbacks and retry behavior | P0 |
| Tenant routing isolation for voice | `PARTIAL` (resolver fallback to tenant `1`/cluster default) | Claimed strict verified routing in PR #2 | `src/voice/tenantResolver.js` fallback block | No merged enforcement + no staging evidence | P0 |
| Immutable session tenant context | `IMPLEMENTED-UNVERIFIED` (session controller stores tenant context) | Claimed strengthened in PR #2 | `src/voice/sessionController.js` + PR #2 commits | End-to-end replay/admission tests in staging | P0 |
| Chat APIs with JWT tenant checks | `PARTIAL` (`/brain/query`, `/api/chat/*` have checks; `/api/gpt/chat` sets `tenantId: 1`) | N/A | `src/routes/brain.js`, `src/routes/chat*.js`, `index.js` `tenantId: 1` | Security test matrix for tenant override paths | P0 |
| Admin-protected Twilio debug endpoint | `VERIFIED` for route auth behavior | N/A | PR #1 merged (`d26ed0b`), `test/twilio-debug-auth.test.js` passing | Scope/privacy of debug payload still not production-proven | P1 |
| Logging/privacy controls (no transcript/provider bodies/secrets) | `PARTIAL` (many logs include payload objects/text/state; some security intent docs exist) | Claimed improved in PR #2 | `src/voice/voiceLogger.js`, `src/routes/twilio.js`, `src/routes/stripeWebhook.js` | Formal log redaction tests + runtime log review in staging | P0 |
| Secrets hygiene in tracked config | `MISSING` (tracked `.env.example` contains secret-like values) | N/A | `.env.example` | Secret rotation + repository cleanup not validated | P0 |
| DB schema for multi-tenant + billing + analytics | `IMPLEMENTED-UNVERIFIED` | Expanded in PR #2 (unreleased migrations) | `migrations/*.sql`; PR #2 file list includes additional migration/docs/tests | Migration application + rollback rehearsal in target DB | P0 |
| CI baseline | `VERIFIED` foundation, `PARTIAL` reliability evidence | N/A | `.github/workflows/ci.yml`; workflow runs include successes and jobless runs | Need stable CI runs with full job execution on active PRs | P1 |
| Test coverage depth | `PARTIAL` on main (local visible test focus is narrow) | Broader suite claimed in PR #2 but unmerged | `test/twilio-debug-auth.test.js`; PR #2 adds many tests | Execute and pass full relevant suites on merged code in CI + staging | P0 |
| Pilot/ops docs | `PARTIAL` (`docs/development-automation.md` exists) | PR #2 includes routing doc (unmerged) | PR #6 merged doc; PR #2 doc changes | Runbook for incident/retry/retention and on-call operations | P1 |

## 4) Safety, security, and privacy findings

### Tenant isolation and routing
- `main` still contains fallback routing to tenant `1` and default cluster (`medical_clinic`) in `src/voice/tenantResolver.js`. This conflicts with strict verified routing expectations for a multi-tenant launch.
- `index.js` `/api/gpt/chat` injects `tenantId: 1`, indicating a hardcoded tenant path in active code.

### Webhook/signature/replay boundaries
- Current `main` Twilio route implementation (`src/routes/twilio.js`) shows webhook/status handlers without explicit Twilio request-signature validation and accepts both GET/POST for voice/status callbacks.
- PR #2 claims hardened signed routing + replay protections, but that remains unreleased until merged and validated.

### Authentication and admin controls
- Positive: `/monitor/twilio-debug` requires admin JWT on `main` (from PR #1), and this behavior is locally test-verified.
- Risk: auth strategies vary across routes (different secrets/claims/middleware conventions), increasing consistency and maintenance risk.

### Secrets handling and privacy
- High-risk hygiene issue: tracked `.env.example` includes credential-like and secret-like values (API keys, SMTP/password-like entries, DB credentials format). This is not acceptable launch posture even if values are placeholders/expired.
- Logging still includes broad payload/object logging in multiple paths (`twilio.js`, `voiceLogger.js`, Stripe webhook logging patterns), so privacy guarantees are not yet demonstrably robust.

### Data retention and PII
- No clearly enforced retention policy evidence for call diagnostics/session traces in accessible `main` artifacts.
- Call/transcript-safe operational logging boundary is not demonstrated as comprehensive on `main`.

## 5) CI/test coverage and gaps

### Commands run in this audit
- `node --test test/*.test.js`
  - Result: `9 tests`, `9 pass`, `0 fail`, `0 skipped`, `0 cancelled`.
- `git ls-files -z '*.js' | grep -zv '^node_modules/' | xargs -0 -r -n 1 node --check`
  - Result: exit code `0`, no syntax errors emitted.

### GitHub Actions evidence
- Workflow: `ACA CI` (`.github/workflows/ci.yml`), single job `Node tests`.
- Recent run history includes successful runs but also runs with `0 jobs` (`failure` and `action_required` conclusions), which means no executable test evidence from those attempts.

### Coverage assessment
- `main` visible in-repo test coverage is narrow (locally observed test file focuses on Twilio debug admin route behavior).
- PR #2 claims broad voice/routing tests but is draft/unmerged and therefore not releasable evidence for `main` behavior.

## 6) External dependencies and blockers

### Technical dependencies for real launch evidence
- Twilio account/number provisioning and signed webhook configuration.
- Accessible staging environment with safe synthetic traffic.
- Target PostgreSQL environment for migration rehearsal and rollback drills.
- OpenAI/STT/TTS provider credentials with budget controls.

### Operational/business blockers (outside repo unless proven)
- Customer onboarding flow, contracts, billing operations, support/on-call, incident management, and privacy/legal approvals are not fully evidenced in-repo.
- Monitoring/alert dashboards, SLOs, and production runbooks are partially documented at best.

## 7) Prioritized launch-blocking gaps (P0/P1/P2)

### P0 (must resolve before first paying customer)
- Remove/replace hardcoded tenant/fallback routing behavior (`tenantId: 1`, default tenant/cluster fallbacks).
- Enforce verified webhook/auth boundaries (voice + callback signature checks, replay controls) on merged `main` code.
- Fix secrets hygiene (`.env.example` and repository scanning/rotation process).
- Prove privacy-safe logging boundaries (no secrets/transcripts/provider bodies in operational logs).
- Execute end-to-end staging validation of Twilio call path and failure modes.

### P1 (required for commercially reliable operation)
- Expand and stabilize CI evidence (no jobless runs; explicit required checks).
- Increase test depth on merged codepaths (routing, replay, auth, tenant isolation, callback handling).
- Add production-like runbooks for operations, rollback, and support escalation.

### P2 (hardening/scale)
- Broaden observability and retention controls.
- Formalize automation guardrails and dispatch orchestration beyond current pilot docs.

## 8) Go/no-go checklists: commercial pilot vs production-ready

### Commercial pilot go/no-go (industry-agnostic, paying pilot)
Go only if all are true:
- P0 items above completed and evidenced on merged `main`.
- One controlled staging tenant/business profile can be configured without hardcoded identity assumptions.
- End-to-end synthetic Twilio calls succeed with documented pass/fail criteria.
- Billing path for pilot charging is validated with synthetic/non-sensitive data.
- Human approval gates for merge/deploy remain enforced.

### Production-ready go/no-go
Go only if pilot checklist passes plus:
- Repeatable multi-tenant onboarding with no tenant-specific code edits.
- Security/privacy review sign-off (independent), including log-data minimization checks.
- Operational readiness (monitoring/alerts, on-call, incident response, rollback rehearsals).
- Capacity/reliability objectives demonstrated under representative load.

## 9) Unverified inventory and questions requiring operator proof

### Explicitly unverified from accessible evidence
- Complete historical backlog and product requirements beyond visible issues/PRs.
- Cloud infrastructure/IaC state, staging/prod environment parity, and deployment controls in host platforms.
- Real customer configurations, dashboards, and external integrations beyond repository artifacts.
- Twilio real-call behavior under retries/network faults for current merged code.

### Operator proof requests
- Provide current branch protection/ruleset screenshots or API evidence for required checks/reviews.
- Provide staging validation artifacts for Twilio webhook signing and stream behavior.
- Provide production logging policy and sampled redacted logs demonstrating no sensitive leakage.
- Provide migration execution logs from target DB and rollback rehearsal evidence.

## 10) Additional automation (Level 2) review

### Current state
- Repository has CI + governance scaffolding and documented human approvals.
- Full Level 2 automation (issue dispatch, state tracking, guarded retries, approvals orchestration) is **not implemented/proven** in accessible evidence.

### What Level 2 needs before trust
- Deterministic issue intake/ownership model.
- State machine for attempt tracking and bounded retry policies.
- Explicit gates for high-risk actions (migrations, deploy, secrets, security config).
- Independent audit trail for approvals and stop conditions.
- Failure-mode drills proving safe halt/escalation behavior.

### Steps that still require manual approval
- Merge authorization, deployment authorization, migration execution, production credential changes, and customer-impacting configuration updates.

## Mandatory dual-path completion plan (owner requirement)

## Path A — Earliest fully functional commercial release

### Objective
Deliver the smallest release that is functional, safe, end-to-end tested in staging, configurable for different businesses, and chargeable.

### Scope boundaries
- Must include: secure tenant routing, webhook/callback verification, privacy-safe logs, one reliable voice flow, pilot billing flow, CI baseline, runbooks.
- Can defer: advanced analytics breadth, extensive partner ecosystem features, broad automation beyond controlled workflows.

### Acceptance tiers
- Pilot-ready: one paying pilot with controlled onboarding and daily human oversight.
- Commercially usable: repeatable onboarding for multiple pilot customers with bounded ops overhead.
- Production hardened: independent security/ops sign-off, stronger observability/SLO evidence, tested incident runbooks.

### Path A work breakdown (estimates are ranges)

| Workstream/story | Current evidence | Priority | Dependencies | Effort range | Human attention | Risk | Exit criteria |
|---|---|---|---|---|---|---|---|
| A1 Secure tenant routing on merged main | Main has fallback tenant/default cluster; PR #2 has draft hardening | Highest | Code merge path + migration readiness | 16-36 eng hrs | High (design/security review) | High | No default tenant fallback; deterministic verified routing tests pass |
| A2 Webhook/callback signature + replay controls | Main shows permissive handlers; PR #2 claims stronger controls | Highest | Twilio config + env setup | 12-28 eng hrs + 4-10 staging hrs | High | High | Signed voice/status callbacks enforced; replay tests pass in staging |
| A3 Secrets/privacy hygiene | `.env.example` contains secret-like data; log payloads broad | Highest | Security review | 8-20 eng hrs + 2-6 security hrs | Medium | High | No secret-like tracked config; redaction policy validated |
| A4 End-to-end staging call validation | Not proven | Highest | A1-A3 complete + staging infra | 6-20 eng hrs + 6-18 staging hrs | High | High | Pass matrix for success/failure/retry call scenarios |
| A5 Pilot billing/ops runbook | Billing routes/migrations exist but limited evidence | High | A4 + operator process docs | 8-24 eng hrs + 4-12 ops hrs | Medium | Medium | Pilot invoice/payment flow tested; rollback/runbook approved |
| A6 CI reliability tightening | CI exists; some runs had 0 jobs | High | Workflow/ruleset admin access | 4-12 eng hrs + 2-6 admin hrs | Medium | Medium | Required checks consistently execute with actionable failures |

## Path B — Complete widest substantiated capability plan

### Scope interpretation
- This path is based on **substantiated repository evidence only** (existing routes, migrations, open issue #4, draft PR #2 content).
- Any missing historical product intent is marked `UNKNOWN`.

### Expanded target areas
- Robust multi-tenant voice + chat platform hardening.
- Broader administration/partner/billing/legal workflows.
- Stronger automation orchestration (Level 2 proven).
- Internationalization depth, observability maturity, and operational resilience.

### Path B phased plan (ranges)

| Workstream/story | Current evidence | Priority | Dependencies | Effort range | Human attention | Risk | Exit criteria |
|---|---|---|---|---|---|---|---|
| B1 Shared secure core (same as Path A A1-A4) | Partial on main, stronger draft in PR #2 | Highest | Same as Path A | 42-104 total hrs | High | High | Path A core exit criteria met |
| B2 Full admin/auth consistency pass | Multiple auth patterns across routes | High | B1 | 20-60 hrs | Medium | Medium | Unified auth policy + regression tests |
| B3 Advanced partner/billing/legal operationalization | Routes/migrations exist; readiness unknown | High | B1, finance/legal decisions | 30-90 hrs + non-eng review | High | Medium-High | End-to-end business workflows with audit evidence |
| B4 Observability/SLO + retention program | Partial metrics placeholders and logs | High | B1 | 24-72 hrs + ops/security review | High | Medium | Alerting/SLOs/retention controls documented and tested |
| B5 Level 2 automation implementation/proof | Not proven; issue #4 indicates need | Medium-High | B1+B4 | 40-120 hrs + approval policy design | High | Medium-High | Bounded retries/state tracking/manual gates validated |
| B6 Internationalization + generalized workflows | Language and cluster schema artifacts exist | Medium | B1 | 20-80 hrs | Medium | Medium | Multi-industry configuration templates validated |
| B7 Production hardening + scale/failure drills | Unknown from repo evidence | Medium | B1-B6 | 30-100 hrs + staged exercises | High | High | Load/failure drills pass with rollback evidence |

### UNKNOWNs for Path B
- Full original product backlog, revenue/feature commitments, and external integration roadmap are `UNKNOWN` from available evidence.

## Quantitative comparison and throughput scenarios

### Effort/cost framing
- Engineering estimates are ranges, not commitments.
- Separate effort buckets: engineering implementation, staging/live validation, business onboarding, independent security/ops review.

### Throughput scenarios

| Scenario | Assumptions | Relative throughput | Risks/constraints |
|---|---|---|---|
| 1. Current supervised Codex + GitHub pipeline | Existing CI + manual approvals + current process | Baseline | Human review bottlenecks, CI job anomalies, manual coordination overhead |
| 2. Level 2 fully implemented and proven | Issue dispatch/state tracking/guarded retries/approval automation fully validated | Faster than baseline for repetitive tasks | **Not currently implemented/proven**; upfront investment and governance complexity |
| 3. Blocked/failure-case | CI instability, missing staging access, unresolved security gaps | Slowest | High rework/idle waits; launch risk remains high |

### Owner review-window constraint
- Planning assumes approval availability window of **7:00 AM-10:00 PM America/Toronto**, occasionally to midnight.
- This is an availability window, not continuous work, and does not authorize automatic merges/deployments.

### Cost ranges (verifiable vs unknown)
- Verifiable in-repo monthly costs: `UNKNOWN` (no authoritative cloud/provider invoices in accessible evidence).
- High/low monthly operating and development-service costs therefore remain `UNKNOWN` from repository-only evidence.
- Known cost inputs requiring operator data: Twilio voice minutes, STT/TTS token/audio usage, OpenAI usage, hosting, database, observability tooling, support/on-call labor.

## Decision framework and recommended shared first phase

### Decision framework
Score both paths against:
- Schedule risk
- Cost uncertainty
- Security/privacy risk
- Completeness vs immediate commercial value
- Operational readiness

### Recommended shared critical-path phase (do first regardless of A vs B)
1. Merge-ready secure core: tenant routing correctness, signed webhook/callback controls, replay handling, secrets/logging hygiene.
2. Staging proof pack: deterministic test matrix for Twilio call lifecycle and failure modes.
3. CI reliability + required checks enforcement evidence.
4. Pilot ops runbook and explicit human approval gates.

This shared phase advances both Path A and Path B without prematurely locking into the full expansion scope.

## Evidence appendix

### Repository references
- Entry/runtime: `package.json`, `index.js`.
- Voice/Twilio: `src/routes/twilio.js`, `src/voice/*`.
- Auth/admin/tenant: `src/routes/brain.js`, `src/routes/tenant.js`, `src/auth/partnerAuth.js`.
- DB/migrations: `migrations/*.sql`.
- CI/governance: `.github/workflows/ci.yml`, `.github/pull_request_template.md`, `AGENTS.md`.

### GitHub references
- Issue inventory observed: #7 (open), #4 (open), #5 (closed).
- PR states:
  - #1 merged (`d26ed0b`) – Twilio debug admin auth hardening.
  - #2 open draft (`aca-029-verified-call-routing`, head `f1eee70`) – unreleased hardening claims.
  - #3 merged (`0f22eb1`) – CI/governance foundation.
  - #6 merged (`122a426`) – automation pilot documentation.
- CI runs include successful executions and runs with `0 jobs` (non-evidentiary for test execution).

### Important boundary statements
- Tests passing in this audit prove only local command outcomes, not production Twilio behavior.
- Draft PR #2 content is unreleased until merged; it must not be treated as production complete.
- Visible repository issues are not evidence of complete historical backlog.
