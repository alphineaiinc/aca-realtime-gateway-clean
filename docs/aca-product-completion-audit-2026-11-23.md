# ACA product — implementation inventory and fastest safe pilot plan
**Audit date:** 2026-11-23. **Source:** main `02395a18092277a8cb65e0d5b4bdb26c3ae5dac2`, open draft PRs, read-only Neon table inventory. This is a static evidence inventory, **not** a complete line-by-line/executed audit. No release is approved.

## Evidence status convention
- **Implemented:** source exists, not necessarily working in deployed runtime.
- **Draft fix:** change exists in unmerged PR; do not count as deployed.
- **Verified:** exact-head CI + staging acceptance evidence linked.
- **Pilot ready:** verified plus authorized deployment and live test.

## Existing implementation — preserve and reuse
| Capability | Source | Status |
| --- | --- | --- |
| Twilio voice webhooks/media streaming, phone capture, barge-in/playback | `src/routes/twilio.js`, `index.js` | Implemented |
| Google streaming STT | `src/brain/utils/sttGoogle.js` | Implemented |
| ElevenLabs TTS/OpenAI TTS | `tts.js` | Implemented; security draft #117 |
| Premium conversation, session and state handling | `src/voice/sessionController.js`, `voiceSessionStore.js`, `stateMachine.js` | Implemented |
| Workflow extraction, reply composition, confirmation, slot validation | `src/voice/workflowExtractor.js`, `workflowStateEngine.js`, `workflowReplyComposer.js`, `slotEnforcement.js` | Implemented |
| Industry/cluster profiles | `src/voice/businessSlotProfiles.js`, `config/clusterIntakeSchemas.js`, `clusterSchemaLoader.js` | Implemented; mapping needs validation |
| Tenant configuration, voice profiles | `src/routes/tenant.js`, `voice.js`, `voiceProfile.js` | Implemented; authentication/schema defects |
| Knowledge upload, embeddings, retrieval | `src/routes/uploadKnowledge.js`, `src/brain/utils/embeddingManager.js`, `retriever.js`, `src/routes/brain.js` | Implemented; inconsistent DB queries |
| GPT/chat/demo and web sockets | `index.js`, `src/routes/chat*.js`, `src/routes/demo.js` | Implemented |
| Dashboards and analytics | `public/dashboard/`, `src/routes/dashboard.js`, `src/analytics/eventCollector.js` | Implemented |
| Billing/invoicing/Stripe email | `src/routes/billing.js`, `src/brain/billingEngine.js`, `src/routes/stripeWebhook.js`, `src/brain/utils/emailer.js` | Implemented; settlement semantics require review |
| Partners, referrals, rewards, payouts | `src/routes/partner*.js`, `src/brain/utils/*Manager.js` | Implemented |
| Monitoring, CI, deployment | `src/monitor/resilienceMetrics.js`, `.github/workflows/ci.yml`, Render app | Implemented; end-to-end not verified |

## Database reality (read-only table inventory)
Existing tables: `master_tenants`, `kb_entries`, `tenant_voice_profile`, `analytics_events`, `billing_invoices`, partner tables; `billing_monthly_summary` and `vw_partner_leaderboard` are views.
Absent from inspected branch: `businesses`, `embedding_spaces`, `tenant_phone_numbers`, `voice_workflow_definitions`, `tenant_workflow_configs`, `voice_stream_grants`, `cluster_schemas`, `clusters`. These are not asserted absent from all environments. Inspect column definitions before changing any schema.
Draft #2 includes additive routing migrations 007/008, **not yet applied** to the inspected database.

## Confirmed blockers and boundaries
1. `src/routes/twilio.js` on main initializes tenant ID to 1 and accepts stream custom parameters. Draft #2 replaces this with signed, fail-closed routing; reconcile rather than rewrite.
2. `src/routes/tenant.js` `/login` issues a JWT on knowledge of tenant ID alone. `src/routes/public.js` has email-only login and hardcoded secret fallback. Draft #127 temporarily disables public signup, **not** a complete verified onboarding solution.
3. `src/routes/tenant.js` and `src/brain/utils/embeddingManager.js` assume `businesses`/`embedding_spaces`; `src/routes/uploadKnowledge.js` writes `kb_entries.business_id/content` while `src/routes/brain.js` reads `kb_entries.tenant_id/query_text/answer`. Reconcile against actual columns, avoid guessing.
4. `src/routes/billing.js` `/pay` marks invoice paid on request, with default `payment_method=mock`; do not represent as verified Stripe settlement.
5. Voice state reaches confirmation/completed; durable booking/request persistence and customer notification delivery are **not yet demonstrated** by reviewed voice completion code. Audit remaining paths before declaring missing.
6. `.github/workflows/ci.yml` only triggers PRs targeting main; stacked PR #128 targets #2, so lack of checks cannot be treated as passing.
7. No full end-to-end Twilio call, staging DB migration, or multi-tenant isolation test verified in this audit.

## Existing work — avoid overlap
- #2 ACA-029 secure routing, migrations and tests; keep draft, not independently merge.
- #128 routing-readiness tests stacked on #2; exact head and test correctness require validation.
- #117 TTS SSRF, #122 Stripe redaction, #123 auth/randomness, #124 upload safety, #125 rate limiting, #127 public signup trust boundary; security platform owns these draft changes.
- #118 is **automation platform Phase 2**, not ACA launch tracker.

## Fastest safe delivery: grouped stories (master issue links maintained separately)
### ACA-L1 — Tenant identity and secure routing (critical)
- [ ] Reconcile #2 against main and latest draft security fixes; resolve merge conflicts in a draft integration branch
- [ ] Read-only schema diff; stage additive 007/008 only after separate authorization
- [ ] Verify Twilio signed webhook, To-number mapping, replay/stream grant and no tenant override
- [ ] Correct unauthenticated tenant-ID login and design a minimal **verified pilot-only** provisioning path
- [ ] Confirm industry workflow/cluster assignment and immutable voice context
- [ ] Exact-head tests + independent security review

### ACA-L2 — Conversation and cross-industry call quality
- [ ] Test existing restaurant, clinic, dental, auto, salon, support, generic workflows without rewriting profiles
- [ ] Validate intent/slot capture, date/time/phone, corrections, confirmation, cancellation, no-repeat and silence/barge-in
- [ ] Test STT/TTS fallbacks and latency; record actual call metrics
- [ ] Fix only reproducible defects and add regression tests

### ACA-L3 — Knowledge, data and request lifecycle
- [ ] Read-only actual column/schema reconciliation for KB, voice profile and tenant routes
- [ ] Reconcile upload safety #124 and KB SQL; test tenant-isolated upload/query
- [ ] Trace completion to durable booking/request record and notification; implement minimal missing link only if absent
- [ ] Ensure caller hears 'request received' rather than 'confirmed booking' unless availability/commit is actually verified
- [ ] Verify idempotency and tenant boundaries

### ACA-L4 — Pilot onboarding, operations and release
- [ ] Create secure manual pilot tenant onboarding, phone assignment, KB/voice config with rollback
- [ ] Validate dashboard, observability, failure alerts, secrets, runbook, cost limits
- [ ] Pilot matrix: inbound call, booking/request, correction, cancellation, wrong tenant, network failure, fallback, notification
- [ ] Document exact deploy SHA, staging evidence, release rollback and owner approval gates
- [ ] No production deployment or paid activation without explicit owner approval

### ACA-L5 — Commercial modules (post-pilot unless blocking)
- [ ] Validate Stripe settlement-only invoice transitions, billing authorization, partner payouts and notification behavior
- [ ] Reuse existing dashboards, partner and billing code; fix only pilot-blocking defects now
- [ ] Security PR coordination; no parallel conflicting edits

## Delivery policy
Large batches, existing-code-first, tests on exact SHAs, evidence attached to stories. One minimal integration PR per coordinated batch, draft until owner approval. Parallelize L2/L3 with L1 when files do not overlap. **Do not** expand automation-platform scope into ACA pilot. No merge, deploy, production writes, secret changes, agent dispatch or paid services without explicit authorization.

## Remaining audit work
Finish source review of less-central modules, examine column definitions and migration dependencies, validate PR #128 tests, execute local/CI suites on exact heads, and stage E2E tests. Mark no item verified until evidence exists.
