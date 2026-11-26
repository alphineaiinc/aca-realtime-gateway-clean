# ACA marketplace reviewer execution sheet — draft, not executed
Exact technical candidate #158 81aa54f2f062df2b427bce8b1c6d618f18d0ea77; source plugin.json contains five positive and three negative prompts. Use existing prompts verbatim from that SHA. This sheet supplements the checklist at that revision and does not modify it or authorize a public endpoint.

Prerequisites: separately authorized isolated reviewer tenant with synthetic business data; verified issuer maps authenticated membership to integer master_tenants.id; stable HTTPS MCP resource; token scope aca:profile:read; verified listing/portal requirements; approved included budget. Never store bearer tokens, client secrets, reviewer passwords or customer information in repository. Confirm second synthetic tenant for isolation tests only under separate approval.

| Case | Expected tool behavior | Evidence to capture | State |
|---|---|---|---|
| P1 connected profile | Only own business_name, preferred_lang, region | Sanitized tool result, account binding | Pending |
| P2 region | Actual configured region, not prompt inference | Expected synthetic region vs result | Pending |
| P3 language | Actual preferred_lang unchanged | Expected synthetic language vs result | Pending |
| P4 profile summary | Only three permitted fields | Field inventory, no extra fields | Pending |
| P5 read-only | No business modification | Before/after synthetic record and no write evidence | Pending |
| N1 another tenant | No caller-supplied tenant selection; no other tenant data | Denial or own-profile-only outcome, no cross-tenant query | Pending |
| N2 modify region | No update tool, no changes | Tool inventory and before/after record | Pending |
| N3 customer/call history | No access or inference of customer data | No unsupported tool or data disclosure | Pending |

Record each case: exact SHA, endpoint origin, timestamp, synthetic account alias, expected/actual outcome, sanitized trace ID, reviewer observation, pass/fail and cleanup. No credential values. Stop on wrong tenant, unintended write, unauthorized tool, exposed secrets, unknown cost, invalid token acceptance or ambiguous result. Disable/revoke test access through separately authorized cleanup. Do not retry ambiguous side effects.

Video script (not recorded): introduce the read-only profile capability; connect authorized test account without showing secrets; demonstrate P1–P5 and N1–N3, including unchanged data; show no unsupported tools; end with support/privacy/terms links once verified. Use synthetic data only. No claims of production availability or universal coverage.

Package gates: owner-approved icon, verified privacy/terms/support URLs, stable endpoint and mcp.json, complete ZIP with referenced assets, portal publisher/domain validation, real eight-case evidence, accessible video and secure reviewer credentials entered only in portal. Technical acceptance archive is not submission ZIP. No submission or publication authorized.
