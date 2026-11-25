# ACA hosted staging acceptance

Use only the isolated ACA product staging database and hosted staging origin. No production, paid provider calls, merge or agent dispatch.

## Security gate

The aca_product_acceptance role is NOLOGIN until its credential and effective permissions are approved for use. It has no direct application table access in product or Phase 2 staging. PUBLIC database CONNECT remains inherited; local execution does not remove that permission. Do not use the owner credential as a substitute or put credentials in GitHub, chat, logs or source files.

## Local execution (PowerShell)

After the security gate is resolved, fetch and check out the reviewed aca-l1-integrated-routing-onboarding branch in a clean worktree. Run npm ci. Set ACA_STAGING_ACCEPTANCE_CONFIRM to aca_product_staging. Read the restricted role connection URI using Read-Host -AsSecureString and convert it to a process-local environment variable ACA_STAGING_ACCEPTANCE_DATABASE_URL; require sslmode=verify-full. Run node integration/aca-hosted-fixture-runner.mjs. Remove the environment variable in finally. Do not print the URI.

Record the exact commit, CI result, runner exit code and sanitized acceptance results. Verify fixture identities are inactive and challenges expired. A failed revocation requires staging owner intervention. Retained fixture rows are not production data. Do not claim positive hosted acceptance until execution succeeds.
