# ACA pilot launch gates — operator checklist

Status: **NOT PILOT READY**. This checklist separates verified evidence from work still to be executed. It does not authorize any database mutation, Actions workflow dispatch, merge, deployment, Twilio call, paid service, or secret change.

## Gate 1 — Exact-head test execution (blocked)
- Branch: `aca-01-routing-readiness-20261123`, stacked on draft ACA-029 PR #2.
- Run `npm ci --ignore-scripts` and `npm test` with Node 22 in a clean checkout of the **current** commit SHA.
- Record command, SHA, test totals, failures, skipped tests, and dependency installation result.
- GitHub connector returned no pull-request workflow runs or combined commit statuses for the last checked commit. **Do not infer passing CI.**
- Run `git diff --check` and `node --check` on changed JavaScript.
- Review integration divergence between `main` and ACA-029 before merge.

## Gate 2 — Isolated ACA staging database (blocked)
Read-only Neon checks on 2026-11-23:
- `aca_main` / `main`: `master_tenants`, `kb_entries`, and `tenant_voice_profile` exist, but ACA-029 routing tables are absent.
- `alphine-aca-phase2-staging` / `staging`: none of the seven inspected ACA application tables were present in `public`.
- **Do not apply migrations to `aca_main`** without separate explicit production authorization.
- Confirm whether to provision a dedicated ACA test branch/database; provisioning and writes require approval.
- In an approved isolated ACA staging environment, verify `master_tenants` schema and run only reviewed 007/008 migrations, then inspect FK, uniqueness, indexes, grants, rollback.
- Use synthetic tenant rows, synthetic E.164 numbers, and inactive workflows. Activate only explicitly reviewed staging fixtures.

## Gate 3 — Voice routing (blocked)
- Signed Twilio POST verification, AccountSid matching, verified To number, unique active tenant/workflow, immutable context.
- Wrong number, inactive workflow, DB unavailable, token replay, and concurrent stream admission all fail closed.
- Test duplicate webhook retry behavior and WebSocket teardown using actual staging Twilio callbacks; no token or sensitive payload logging.

## Gate 4 — Voice quality (blocked)
- Speech recognition for quiet/noisy calls, barge-in, silence, repeated prompts, and interruption cancellation.
- Confirm one-question-at-a-time intake for restaurant, medical, auto service, and generic workflows.
- Measure turn latency from recorded test results; do not assert a sub-2-second SLA without measurements.

## Gate 5 — Booking integrity (blocked)
- Confirm captured slots and caller confirmation, validate date/time and business timezone.
- Persist a single booking/lead with tenant isolation and idempotency; distinguish **request received** from **appointment confirmed**.
- Verify notification failures do not cause false confirmations or duplicate bookings.

## Gate 6 — Pilot approval (blocked)
- Tenant onboarding, voice profile, KB isolation, audit trail, monitoring, error alerts, cost controls, and rollback plan.
- One explicitly approved pilot tenant, numbers and services; limited live-call test with consent and no customer data in logs.
- Written owner authorization required separately for merge, deploy, secrets, production migration, and paid activations.

## Current estimate
Engineering planning estimate ~60% to a *controlled pilot*, with substantial uncertainty until exact-head tests, migration rehearsal, and real-call evidence exist. Remaining time estimated 3–6 weeks; 2–4 weeks is an optimistic stretch, not a delivery commitment.
