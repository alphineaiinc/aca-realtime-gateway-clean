# Alphine AI — Development Agent Instructions

This repository supports an industry-agnostic, multi-tenant automated call-attendant platform. Never hardcode a customer, tenant ID, industry, clinic, resort, language, or fallback business identity.

## Workflow
- Work from an explicitly scoped GitHub issue on a separate branch.
- Keep changes small; include reproduction and regression tests for defects.
- Run available tests and syntax checks; report actual commands and counts.
- Document architectural, provider, security and privacy changes in the same PR.
- Record assumptions and unresolved risks. Do not claim staging or production validation from isolated tests.
- Never log secrets, provider error bodies, caller transcripts or personal data in operational logs.
- Preserve strict verified Twilio tenant routing, replay protection and immutable session context.

## Safety and authorization
- Never commit real credentials or customer data.
- No production access, deployments, migrations, auto-merge or force pushes without explicit human approval.
- A green CI run or agent review is not a release approval.
- Do not modify ACA-029 branches or draft PR #2 when working on automation.
- Obtain human approval before significant architecture changes, spending or external integration changes.

## Review handoff
Each PR must describe the business outcome, files changed, tests/evidence, risks, limitations, and rollback/staging steps.
