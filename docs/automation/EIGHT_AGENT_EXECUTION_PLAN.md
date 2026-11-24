# Eight-agent engineering team and Agent Manager

Owner-approved development reprioritization, 2026-11-23: pause Item 14 at its current draft checkpoint; no closure or release clearance. Build section F's existing eight roles and section G's separate Agent Manager next, in isolated offline development. Keep all prior security gates, including independent reviewer #22, intact. No live dispatch, signing, merges, deployments, secrets/settings changes or live database writes authorized. Item 14 resumes through approved engineering workflows only after applicable security gates. Exact heads/CI: #117 355cefaaf4792ed1ac5382e38163e7b9ee0b9c66 green; #115 2a47fb399b63aebfdc7f5d2bc37afe834623e4f4 green; #122 004ae42c63b9a7ef235d18df15a5377ec2817709 green; #124 35610244314b70bde24491a2a0e42a49a3a01e1d pending run 45294328363; #125 46b534a2031b82dd50a496ae6eb30dbc8cbcd34f green; #127 3e1720882c51ad499862ce39d0be4bdd236e8c6a green; #139 211ef965e0f672223d0d33ee4adc630f319e9dbc green. Remaining: upload cross-instance resource/fencing and pgvector tests; Stripe recovery; verified onboarding; exact-head dependency and CodeQL reconciliation; integrated regression and independent acceptance. Historical alert inventory not live clearance. SDP-001 remains mandatory.

## Canonical roles
Use #118 section F: Project Manager, Solution Architect, Backend Developer, Frontend Developer, QA & Testing, Security Reviewer, DevOps, Orchestrator. Agent Manager is a distinct policy enforcement component, not a ninth worker. This preserves the earlier owner-approved role split; requirements and release coordination belong to Project Manager and Orchestrator/DevOps.

## Acceptance and boundaries
1. Immutable role registry and structured task contracts, deny unknown roles and actions.
2. Manager enforces repository/product scope, bounded attempts and stop/quarantine, independent review separation, audit events without arbitrary payloads.
3. Offline role execution through injected fixture adapters only; no external provider or GitHub credentials, no native dispatch, no network actions. Agent outputs are proposals, not permissions.
4. Individual role behavior tests and integrated disposable lifecycle, with negative tests for cross-scope actions, forbidden operations, cancellation and self-review.
5. Later integrate existing queue/policy/reviewer components after exact-head dependency audit. Real provider-backed agents, durable state, independent security evidence and live activation are separate unchecked gates.

Status: IN PROGRESS. Rollback: abandon isolated draft branch. No production runtime wiring.

## Batch 2 — structured role contracts
Foundation exact head 8e8ce6fe18c53cb631b576a5d1b257732c4e57bd passed CI run 45294951871. Eight role-specific contracts now require bounded arrays of text, reject extra fields and freeze accepted proposals. Trusted adapters are captured at manager construction, never supplied per request. Prior accepted proposals are task-local. This is a trusted in-process fixture boundary, not a sandbox or independent reviewer identity. Real model adapters, capability broker, persistence, cancellation of in-flight work and semantic verification remain pending. No live dispatch or provider use.
