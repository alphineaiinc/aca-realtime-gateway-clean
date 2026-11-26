# ACA commercial scope and evidence index — draft
2026-11-25 | CAP-001 | Owner scope freeze: https://github.com/alphineaiinc/aca-realtime-gateway-clean/issues/129#issuecomment-7178873594
Retain E00–E12 and ACA-001–089, all previously approved additions, and existing delivery groups #130–134. This is a scope index, not a completed story-level mapping or replacement backlog. Earlier 48 permanent-ID references in #129 governance history must be reconciled with their original baseline; do not silently change either denominator. No new feature or activation authority.
 
| Group | Approved scope retained | Evidence/remaining gate |
|---|---|---|
| L1 #130 | Secure tenant identity, verified Twilio routing, explicit cluster/slot/workflow, carrier-neutral foundation | Commercial core #148; carrier #157; hosted positive telephone and effective identity acceptance remain |
| L2 #131 | Universal voice engine, corrections, confirmations, Global Voice Studio, natural regional voice/language, interruption, fallback and escalation | Reuse existing engine and industry matrix; real call/latency/provider/language quality remains |
| L3 #132 | Tenant KB, appointments/reservations, leads, callbacks, durable requests and notification/human transfer actions | Prior staging Gmail provider acceptance, not inbox receipt or universal delivery; hosted end-to-end acceptance remains |
| L4 #133 | Secure onboarding, expanded dashboards/analytics, health, alerts, recovery, transparency, marketplace | Existing draft foundations, external submission gates separate; staging acceptance and release authority remain |
| L5 #134 | Billing, subscriptions, invoices, usage, tax, Stripe, partner/referral/reward/payout | Draft commercial controls; actual provider contracts, financial roles and reconciliation remain; defer only documented nonblocking activation |
Global targets 100+ countries, 30+ languages, all African countries are targets, not coverage claims; reuse global-readiness-matrix.md. WhatsApp evaluation only; no resort-specific product.

## Exact candidate evidence
- #148 commercial core 2813610fa4df452b46e0297542f32824b1a911e5; CI 45718082632 passed, prior exact-head candidate CI 45717666507 and CodeQL 45717666462 passed; independent receipt 7177039173. Latest candidate-specific workflows skipped; do not infer new execution. #129 comment 7177063087 recorded staging deploy dep-dc3mhk6q1p3s73blq3s0 initiated; live status not verified in this batch.
- #157 carrier foundation f83a7a43cee40df5418153a59b52a3c03a8bf7e5; structured disposition 7179070435 completed no findings/unresolved findings; receipt 7179111526. No carrier activation or country availability inferred.
- #158 marketplace 81aa54f2f062df2b427bce8b1c6d618f18d0ea77; CI 45729607393, candidate CodeQL 45729607401, SDK 45729607421 successful; receipt 7178951464. SDK logs: 273 primary passes, 0 failures, 6 skips; separate extracted package 12/12; npm audit total 0. Artifact 15076077937 observed unexpired, digest sha256:301a0ebae48acd0508680f4155e414b31c633860fd9656216ed9cb8787286bc0; one-day retention, not a public submission ZIP. Lock SHA256 dc29fbc2bb673045b8f8efda54fb115720a5438d7361ffc2bbd77bb13086d8c4.
- #157 and #158 both based on #148 head; combined acceptance not inferred. Preserve all three frozen candidates.
- Prior #129 comment 7176467943: exact older 9a05efd candidate staging provider accepted one Gmail notification, tenant 6/request 4, one sent reservation; recipient deactivated and flags set false; no repeat delivery. Cleanup and subsequent hosted revision require evidence. No customer data in this index.
- Stage 3 automation HOLD 70% provisional, separate from ACA; Stage 2 separate. MOAA, SDP-001/002, OLR-011/012, CAP-001; CAD0. No merge, deploy, credentials, public submission, provider dispatch or production write.
