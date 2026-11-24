# SEC-09 isolated hosted diagnostic procedure

Do not merge this diagnostic branch. No production, credential, migration or paid infrastructure changes.

1. Verify exact diagnostic head CI including logging and readiness regression tests. Verify original staging revision bab2b34f0344e6dc42b52a6eb53b7e40bf97baa2 live and staging auto-deploy disabled.
2. Record original ref and deploy ID. Advance staging using an exact expected-SHA lease only. Trigger existing staging service deployment. Do not trigger hosted assertions until Render confirms exact diagnostic SHA live and private ACA_SEC09_START log has serviceMatches true.
3. Use fixed HTTPS staging URL, read-only runner, no secrets, no redirects, bounded timeouts. Require HTTP 200 and exact aca-sec09-probe-v3 readiness body. Record each actual and expected HTTP status. Baseline and marker probe expect 204; five synthetic Twilio requests expect 204, sixth 429; Stripe and ordinary expect 204. Inspect private ACA_SEC09_PROXY logs for marker and resolved identity booleans. Never publish raw headers or addresses.
4. On any failure or completion, restore original ref with exact lease and trigger restoration. Confirm exact original SHA live; remove temporary workflow probes. Record results in issue #129. Do not leave diagnostics live awaiting another test.
5. Synthetic budgets do not establish actual provider throughput or authoritative Render proxy CIDRs. Offline harness does not prove hosted service identity. Commercial acceptance remains held until those gates are independently cleared.
