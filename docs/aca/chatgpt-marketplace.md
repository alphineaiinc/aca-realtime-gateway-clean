# ACA ChatGPT marketplace (#133)

Base: accepted commercial revision 2813610. Independent of carrier PR #157. Do not enable legacy /api/gpt/chat (503 pending isolation).

Initial static capability tool is offline only. Next: supported MCP SDK, disabled-by-default HTTPS transport, OAuth 2.1 resource/audience/scope validation, verified tenant mapping, minimum-data read tools. Never use caller-provided tenant identifiers or provisioning API keys as customer authentication. No write tools, payment or public demo until separate security acceptance.

Submission gates: verified publishing business, Apps Management Write, production HTTPS MCP endpoint, domain challenge, website/support/privacy/terms URLs, package ZIP, scan, five positive and three negative review cases, demo recording, isolated reviewer account, policy attestation, approval and explicit publication. No credentials in package. Country and commerce eligibility must be verified. Current listing status unverified.

References: https://developers.openai.com/plugins/deploy/submission ; https://developers.openai.com/plugins/deploy/app-review ; https://developers.openai.com/plugins/build/auth ; https://developers.openai.com/plugins/plugin-guidelines

CAD $0; no deployment, merge, credential provisioning or publication authorized in this batch.
