# ACA-01 routing readiness — verified evidence (2026-11-23)

## Git and scope
- ACA-029 base: draft PR #2, head `f1eee70bd07139047401beea143b47f0832c325f`.
- This ACA-01 stacked branch adds fail-closed regression tests without changing runtime behavior.
- GitHub compare against `main` reports **diverged**: 5 commits ahead and 5 behind; do not merge this stacked branch into `main` independently.
- No workflow runs or combined statuses were returned for ACA-01 commit `3147c289e04568a3e0243ef92444bf5014970f2a` at audit time. **Tests are not verified passing.**

## Read-only Neon schema observations
Queries were limited to `information_schema.columns` for the listed ACA tables. No writes were made.

### ACA main project `aca_main` (`blue-night-09261872`, branch `main`)
- `public.master_tenants`: `id integer`, `business_name text`, `preferred_lang text`, `region text`.
- `public.kb_entries`: `id integer`, `tenant_id integer`, `query_text text`, `answer text`, `embedding USER-DEFINED`.
- `public.tenant_voice_profile`: `tenant_id integer`, `lang_code text` and voice-related fields.
- No `public.tenant_phone_numbers`, `public.tenant_workflow_configs`, `public.voice_workflow_definitions`, or `public.voice_stream_grants` columns/tables were returned.

### Separate automation staging project `alphine-aca-phase2-staging` (`still-cell-80928176`, branch `staging`)
- No columns were returned for the seven queried ACA application tables in `public`. This is not evidence that staging is an ACA-ready database.

## Release gates
1. Validate exact-head tests in a CI job or a clean Node 22 environment; do not claim passing without execution evidence.
2. Review and reconcile migrations 007 and 008 with the target staging schema and permissions.
3. Use an explicitly approved isolated ACA staging environment with synthetic tenants and phone assignments; do not seed real customers or modify production.
4. Review workflows and number ownership out-of-band; activate only reviewed mappings.
5. Verify Twilio signature, stream admission, replay, provider start, and voice turn tests in staging.
6. Reconcile `main` divergence and open security PR overlap before any owner-approved merge.
7. Do not deploy or enable production ingress without separate approval.

## Security
Keep unknown numbers and missing workflow assignments fail-closed. Never restore the tenant-1/medical fallback. Do not log Twilio capabilities or credentials.
