# Launch-Readiness Audit (ACA-AUDIT-001)

## 1) Executive Verdict

### What is demonstrably true now
- The repository contains a working Node/Express application with voice, chat, billing, partner, and migration code paths.
- `main` has CI foundations (`ACA CI`, `Node tests`) and explicit human approval language for merge/deploy decisions.
- Draft PR #2 (`ACA-029`) contains substantial security/routing hardening work but is still unmerged and unreleased.
- This audit revision includes a feature-by-feature dashboard/UI plus backend wiring inventory and explicitly separates file presence from proven runtime behavior.

### What is not yet demonstrated
- End-to-end staging-verified Twilio behavior for merged `main` under realistic retries/failures.
- Production-grade tenant isolation confidence across all entry points.
- Complete, tested dashboard/admin experience as currently wired in this branch.
- Complete historical backlog/original roadmap from repository evidence alone.

### Bottom line
- `main` is **not launch-ready for a general-industry paying customer** yet.
- The shortest credible path is a focused hardening + wiring + validation phase that closes dashboard/backend disconnects and security/tenant-risk items before commercialization claims.

## Status Legend
- `VERIFIED`: directly evidenced by source + command/API evidence in this audit.
- `IMPLEMENTED-UNVERIFIED`: code exists, but launch-relevant validation is missing.
- `PARTIAL`: mixed implementation with clear gaps/disconnects.
- `MISSING`: expected capability not found in accessible evidence.
- `UNKNOWN`: may exist outside accessible evidence.

## 2) Methodology, Scope, and Evidence Limits

### Methodology used for this revision
- Inspected source files for runtime wiring (`index.js`, `src/routes/*`, `src/voice/*`, `public/dashboard/*`, `migrations/*`, CI docs/workflows).
- Mapped each requested dashboard page to its concrete API calls and matched those against mounted backend routes and auth/tenant behavior.
- Re-checked GitHub Actions evidence using MCP tools (`list_workflow_runs`, `list_workflow_jobs`, `get_job_logs`).
- Re-ran safe local validations:
  - `node --test test/*.test.js` -> `9 pass, 0 fail`.
  - `git ls-files -z '*.js' | grep -zv '^node_modules/' | xargs -0 -r -n 1 node --check` -> exit `0`.

### Evidence boundaries
- This is a read-only repository audit; no app/runtime behavior was changed.
- Passing local tests/CI checks are not proof of staging/production call quality or operations readiness.
- External infrastructure, production settings, and private historical artifacts remain unverified unless explicitly evidenced.

## 3) Source-of-Truth Map (Main Branch Behavior)

### Runtime and route composition
- Entrypoint: `package.json` -> `index.js`.
- Core mounts in `index.js` include:
  - `/twilio` (`src/routes/twilio.js`)
  - `/api/voice` (`src/routes/voice.js`)
  - `/api/chat` (`src/routes/chat.js`) plus `/api/chat/stream` (via `src/routes/chat_stream.js` mounted at `/api`)
  - `/api/billing` (`src/routes/billing.js`)
  - `/api/stripe` (`src/routes/stripeWebhook.js`)
  - `/partner` (`src/routes/partner.js`, `/partner/*` dashboard/leaderboard modules)
  - `/tenant` (`src/routes/tenant.js`)
  - `/api/demo` (`src/routes/demo.js`)
- Static files are served from `public/`, so dashboard HTML files are accessible as static assets.

### Important wiring caveat
- `src/routes/dashboard.js` exists (`/dashboard`, `/dashboard/data`, `/dashboard/brain-status`) but no `/dashboard` router mount was found in `index.js`. Dashboard pages expecting `/dashboard/*` APIs are therefore currently disconnected unless mounted elsewhere not visible in this repository snapshot.

### Voice workflow stack
- Twilio stream processing: `src/routes/twilio.js` + `src/voice/sessionController.js`.
- Workflow extraction/state/composition: `workflowExtractor.js`, `workflowStateEngine.js`, `workflowReplyComposer.js`.
- STT/TTS providers: `src/brain/utils/sttGoogle.js`, `tts.js`.

## 4) Dashboard/UI + Backend Feature Inventory (Requested)

## 4.1 Dashboard pages and concrete wiring

| UI page (static path) | Frontend API calls | Backend evidence | Auth / tenant isolation | Tests found | Status | Staging evidence needed |
|---|---|---|---|---|---|---|
| `/dashboard/index.html` (`public/dashboard/index.html`) | `GET /dashboard/brain-status`, `GET /dashboard/data` | Endpoints exist only in `src/routes/dashboard.js`; no `app.use('/dashboard', ...)` found in `index.js` | No page-level auth; backend route auth not shown (router not mounted) | None specific | `PARTIAL` (API contract present, wiring gap) | Prove router mount + authenticated/authorized access expectations + live response with realistic data |
| `/dashboard/billing.html` | Uses `/api/billing/*`, including `/download-all` and `/invoice/:id` | `src/routes/billing.js` has `/generate,/history,/pay,/status/:id,/stats,/summary,/export,/email/:id,/download-all`; no `/invoice/:id` route | JWT required via `authenticate`; tenant scoped by `tenant_id` from token | No billing tests in `test/` on main | `PARTIAL` (mostly wired, one endpoint mismatch, untested) | Verify all UI actions against implemented endpoints; resolve `/invoice/:id` mismatch; run tenant-isolation tests |
| `/dashboard/voice.html` + `voice.js` | `/api/voice/profile` (GET/POST), `/api/voice/preview` (POST) | Implemented in `src/routes/voice.js` and mounted at `/api/voice` | JWT required; tenant from token | No dedicated voice route tests in `test/` on main | `IMPLEMENTED-UNVERIFIED` | Validate end-to-end profile save/load/preview and provider-failure handling in staging |
| `/dashboard/monitor.html` | `GET /monitor/deploy-matrix` | Endpoint exists in `index.js` and is `requireAdmin` protected | Admin JWT required; page does not attach auth header in fetch call | No monitor page tests | `PARTIAL` (endpoint exists; UI request path likely unauthorized as written) | Validate authenticated monitor access path and expected failure UX for unauthorized users |
| `/dashboard/chat.html` + `chat.js`/`chat_stream.js`/`chat_ws_client.js` | `/api/demo/token`, `/api/chat`, `/api/chat/stream`, WS `/ws/chat` | All endpoints/routes exist and are mounted | JWT/demo token required; tenant behavior varies by route | No chat route tests in `test/` on main | `IMPLEMENTED-UNVERIFIED` | Validate REST/SSE/WS chat flows with valid/invalid tokens and tenant isolation in staging |
| `/dashboard/confidence.html` | No direct API calls in this page (branding shell) | No direct backend dependency in file | N/A | None | `PARTIAL` (page present, no demonstrated functional data path) | Define intended behavior and connect to monitored data source if required |
| `/dashboard/partners.html` | `/partner/profile`, `/partner/rewards`, `/partner/referrals`; builds referral link to `/tenant/provision?ref=...` | `profile/rewards/referrals` exist in `src/routes/partnerDashboard.js` mounted under `/partner`; `/tenant/provision` exists but expects API key, not referral query | Partner JWT required for partner routes; tenant provisioning endpoint uses `x-api-key` | No partner dashboard tests on main | `PARTIAL` (core partner reads exist; referral-to-provision UX appears disconnected from provisioning auth model) | Validate partner token issuance, referral onboarding flow, and provisioning mechanism alignment |
| `/dashboard/leaderboard.html` | `/partner/leaderboard`, `/partner/payouts/request` | Implemented in `src/routes/partnerLeaderboard.js` | JWT required; payout request uses partner token | No leaderboard/payout-request tests on main | `IMPLEMENTED-UNVERIFIED` | Validate leaderboard scopes/data quality and payout request lifecycle |
| `/dashboard/payouts_admin.html` | `/partner/payouts/admin`, `/partner/payouts/admin/decision` | Implemented in `src/routes/partnerLeaderboard.js` (admin gated) | Admin role required in JWT (`requireAdmin`) | No admin-payout tests on main | `IMPLEMENTED-UNVERIFIED` | Validate admin decision workflow, audit trail, and rejected/paid edge cases |

## 4.2 Backend capability domains requested in review

| Domain | Evidence on main | Current state | Test evidence on main | Validation required |
|---|---|---|---|---|
| Onboarding/provisioning | `src/routes/tenant.js` (`/tenant/provision`, `/tenant/login`, `/tenant/profile`), `src/routes/public.js` exists but no mount found | `PARTIAL` | No dedicated tests in `test/` | Verify mounted onboarding paths, referral compatibility, and auth model coherence |
| Configuration/workflow management | Voice workflow logic in `src/voice/*`, cluster schema loading in `src/voice/clusterSchemaLoader.js` | `IMPLEMENTED-UNVERIFIED` | None on main beyond Twilio debug auth test | Staging calls proving workflow selection, slot capture, and tenant correctness |
| Usage/billing | `src/routes/billing.js`, `src/brain/billingEngine.js`, billing migrations | `IMPLEMENTED-UNVERIFIED` with UI/API mismatch (`/invoice/:id`) | No billing tests on main | Exercise all billing endpoints + invoice retrieval/export paths |
| Stripe | `src/routes/stripeWebhook.js` mounted at `/api/stripe` | `IMPLEMENTED-UNVERIFIED` | No stripe webhook tests on main | Signature handling + event processing tests in CI/staging |
| Partner/legal/payouts | `partner.js`, `partnerDashboard.js`, `partnerLeaderboard.js`, `partnerPayout.js`, `partnerLegal.js` | `PARTIAL` (broad surface exists; overlap/inconsistency risk) | No dedicated tests on main | End-to-end partner lifecycle tests + auth consistency pass |
| Analytics/monitoring | `migrations/006_create_analytics_events.sql`, `src/analytics/eventCollector.js`, monitor endpoints in `index.js` | `PARTIAL` | No explicit monitor/analytics tests | Validate event completeness, retention/privacy, and dashboard correctness |

## 5) Main vs Draft PR #2 (ACA-029) Separation

### Main (`main` branch) summary
- Voice/chat system and admin diagnostics route protections exist.
- Material risk remains around webhook verification rigor, tenant fallback defaults, and broad logging/privacy posture.

### Draft PR #2 summary (unmerged, unreleased)
- PR #2 contains substantial hardening claims (verified Twilio routing, replay handling, diagnostics redaction, speech lifecycle fixes), but it is still draft and not merged into `main`.
- None of PR #2 behavior should be treated as production-complete for current launch decisions.

## 6) Security, Privacy, and Tenant Isolation Findings

### `.env.example` classification correction
- The file contains **credential-like / secret-like strings and placeholders**.
- This audit does **not** prove those values are live/active production secrets.
- Risk classification for launch: treat as potential exposure until owners complete secure review and rotation confirmation.
- No secret values are reproduced in this document.

### Key security findings on `main`
- Tenant fallback risks remain in runtime paths (e.g., hard fallback behavior in `tenantResolver`, hardcoded tenant context in some chat pathing).
- Twilio callback/webhook handlers in current main source show permissive method handling and no explicit request-signature enforcement in visible code.
- Logging surfaces include broad payload/object logging in sensitive domains; privacy-safe boundary is not yet demonstrated comprehensively.

## 7) CI/Test Coverage and Corrected Evidence Limits

### Verified CI facts
- Active CI workflow: `.github/workflows/ci.yml` with required job name `Node tests`.
- Successful post-merge `main` run exists: `ACA CI` run `44831732013` (`success`).
- PR runs `44833911528` and `44834614188` ended `action_required` with `total_jobs: 0`.

### Interpretation correction
- Not all zero-job events should be interpreted as unexplained execution failures.
- Current evidence is consistent with runs requiring workflow/job approval in some AI-created PR contexts, as noted by owner feedback.
- Evidence limit: run metadata confirms zero executed jobs for those runs; root policy configuration details are outside source control and must be validated in GitHub settings.

### Ruleset correction
- Per owner-provided review evidence, an active `ACA - Protect Main` ruleset requires PRs and `Node tests`.
- Repository files alone cannot fully prove live ruleset configuration; this remains operator-verified context.

### Test coverage reality on main
- In-tree test files currently visible: `test/twilio-debug-auth.test.js` only.
- Local run: `9/9` passing confirms that one test suite and syntax checks, not full platform readiness.

## 8) External Scope and Historical-Scope Honesty

- `aca-realtime-gateway-clean` is treated as the primary ACA runtime repository based on owner guidance in this review thread.
- `alphineai-website` is separate and appears customer/marketing-facing; deployment/runtime relevance to call-attendant production is `UNKNOWN` from this repository evidence.
- Other repositories/infrastructure/backlog sources are `UNKNOWN` unless separately evidenced.
- Therefore Path B planning below is limited to substantiated evidence plus explicit `UNKNOWN` markers where historical requirements are missing.

## 9) Prioritized Launch-Blocking Gaps (P0/P1/P2)

### P0
- Close dashboard/backend disconnects for business-critical operations (dashboard router mount and endpoint mismatches).
- Remove hard tenant defaults/fallback assumptions from launch-critical call/chat paths.
- Enforce and verify secure webhook/callback trust boundaries on merged code.
- Complete secrets-hygiene review and rotation decision for credential-like tracked examples.
- Prove privacy-safe operational logging in staging.

### P1
- Consolidate auth/authorization patterns across partner/admin/tenant surfaces.
- Expand CI and tests to cover billing, partner payouts/legal, chat/voice path regressions.
- Validate onboarding/provisioning flow end-to-end with realistic roles and approvals.

### P2
- Observability, retention governance, and operational hardening at scale.
- Advanced automation and wider capability expansion after secure core is proven.

## 10) Path A vs Path B Completion Plans

## Path A — Earliest fully functional, safe, general-industry commercial release

### Definition
- Not a telephony-only proof-of-concept.
- Includes telephony + dashboard/admin + onboarding + billing foundations needed for a paying pilot that can operate safely under human supervision.

### Dependency-ordered critical path
1. **Security and tenancy baseline**: remove default tenant/fallback behaviors; verify webhook trust chain on merged code.
2. **Dashboard/backend wiring correctness**: mount/repair dashboard API paths, fix endpoint mismatches (`billing` UI/API), verify role-protected monitor/admin flows.
3. **Onboarding + provisioning**: align referral onboarding UX with actual provisioning auth model.
4. **Billing + partner essentials**: validate invoice lifecycle and partner payout/legal flows with role checks.
5. **Staging validation pack**: scripted pass/fail matrix across voice/chat/dashboard/billing/admin.
6. **Independent review gate**: security/privacy + ops check before first paid pilot.

### Path A acceptance gates
- Pilot gate: all P0 complete + staging matrix pass + documented rollback.
- Commercially usable gate: repeatable onboarding and billing flows with bounded operator load.
- Production-hardened gate: independent security/ops review + stronger reliability evidence.

### Path A effort ranges
- Engineering implementation: **40-110 hours**.
- Staging/live validation effort: **20-55 hours**.
- Operator approvals/coordination: **10-35 hours**.
- Independent security/operational review: **8-30 hours**.

### Deferred in Path A
- Broad advanced analytics expansion.
- Fully automated Level 2 orchestration.
- Non-critical feature polish unrelated to first paying customer outcomes.

## Path B — Widest substantiated original ambition completion

### Definition
- Build out the broadest capability set supported by repository evidence, while marking missing original requirements as `UNKNOWN`.

### Expanded workstreams beyond Path A
- Auth model unification across all route families.
- Full partner/legal/payout operational maturity and auditability.
- Observability + retention controls with stronger governance.
- Wider workflow/admin/internationalization surface where evidence exists.
- Level 2 automation implementation and proof.

### Dependency-ordered phases
1. Shared secure core from Path A.
2. Admin/auth consistency refactor and regression suite.
3. Partner/legal/payout maturity and reconciliation-grade workflows.
4. Observability/retention and runbook hardening.
5. Level 2 automation implementation + bounded-retry proof.
6. Scale/failure drills and production hardening.

### Path B effort ranges
- Engineering implementation: **130-360 hours**.
- Staging/live validation effort: **45-130 hours**.
- Operator approvals/coordination: **35-110 hours**.
- Independent security/operational review: **20-70 hours**.

### Path B unknowns
- Complete original product backlog and promised capability set: `UNKNOWN`.
- External system commitments/cost contracts not in this repo: `UNKNOWN`.

## 11) Calendar-Range Scenarios (No fabricated precision)

Assumptions:
- Owner approval availability: **7:00 AM-10:00 PM America/Toronto**, occasionally to midnight.
- Availability window is not equivalent to full-time continuous throughput.
- Human approvals remain mandatory; no auto-merge/deploy.

| Scenario | Path A indicative calendar range | Path B indicative calendar range | Notes |
|---|---|---|---|
| Current supervised agent process | ~3-8 weeks | ~8-20+ weeks | Depends heavily on review cycles, staging access, and defect discovery |
| Hypothetical proven Level 2 automation (not implemented today) | ~2-6 weeks | ~6-16+ weeks | Requires prior Level 2 build-out/validation; cannot be assumed immediately |
| Blocked/failure-case (CI/policy/staging bottlenecks) | ~6-12+ weeks | ~14-30+ weeks | Represents realistic slips under unresolved blockers |

## 12) Cost Visibility and Unknowns

- Verifiable monthly cost totals from this repository alone: `UNKNOWN`.
- Known cost drivers requiring operator-supplied evidence:
  - Twilio telephony usage.
  - OpenAI/STT/TTS provider usage.
  - Hosting/database/monitoring services.
  - Human operations/support/review time.
- Recommendation: track high/low monthly ranges externally with actual billing exports before go/no-go.

## 13) Audit Completeness Checklist (Requested)

- [x] Voice/telephony and Twilio handlers audited.
- [x] Dashboard pages audited feature-by-feature against backend wiring.
- [x] Billing/Stripe paths reviewed.
- [x] Partner/legal/payout paths reviewed.
- [x] Provisioning/onboarding paths reviewed.
- [x] Website external scope explicitly classified (`UNKNOWN` relevance unless evidenced).
- [x] Original roadmap scope limitations explicitly marked (`UNKNOWN` where unsupported).
- [x] Path A vs Path B plans include dependencies, gates, effort ranges, and calendar scenarios.

## 14) Remaining Unverified Gaps Requiring Operator Proof

- Live ruleset/policy configuration details in GitHub admin UI (beyond owner statement).
- Staging/prod environment parity and real Twilio callback/signature behavior.
- Actual dashboard deployment route map and whether `/dashboard` router is mounted in deployed artifact.
- Data-retention and privacy controls in production logging infrastructure.
- Billing/finance/legal operational sign-offs and audit requirements.

## 15) Evidence Appendix

### Key files inspected
- Runtime/composition: `index.js`, `package.json`.
- Dashboard UI: `public/dashboard/*.html`, `public/dashboard/*.js`.
- Backend routes: `src/routes/*.js` (billing, voice, chat, partner, legal, payout, tenant, demo, twilio, brain, dashboard).
- Voice engine: `src/voice/*.js`.
- Migrations: `migrations/*.sql`.
- CI/governance: `.github/workflows/ci.yml`, `.github/pull_request_template.md`, `AGENTS.md`, `docs/development-automation.md`.

### GitHub Actions evidence used
- `ACA CI` success on `main`: run `44831732013`.
- PR run `action_required` with zero jobs: `44833911528`, `44834614188` (both `total_jobs: 0`).

### Command evidence used in this audit revision
- `node --test test/*.test.js` -> `9 pass, 0 fail`.
- `git ls-files -z '*.js' | grep -zv '^node_modules/' | xargs -0 -r -n 1 node --check` -> exit `0`.

### Final boundary statements
- This document distinguishes repository code evidence from staging/production proof.
- Draft PR #2 remains unmerged and is not treated as released functionality.
- This PR remains open and requires independent human verification/authorization before merge.
