# Phase 2 reviewer staging rollout — pre-deployment checklist (2026-11-21)

## Implemented in development only
- Reviewer GitHub App RSA key read from the **fixed** Render Secret File path `/etc/secrets/github-reviewer-app.pem`, gated by `ACA_REVIEW_GITHUB_APP_PRIVATE_KEY_PATH` set to that exact path.
- Invalid PEM, non-RSA private key, missing/unreadable file, oversized contents and arbitrary paths fail closed.
- Existing HTTP reviewer fixtures migrated to injected key readers; production file contents are never loaded by CI tests.
- `ACA_REVIEW_GITHUB_APP_ID=5858755` and `ACA_REVIEW_GITHUB_INSTALLATION_ID=184252224` are identifiers, not proof of GitHub authorization.
- Reviewer Ed25519 verdict signing remains **separate** (`ACA_REVIEW_PRIVATE_KEY`). Do not enable it for authentication smoke tests.

## Staging rollout prerequisites — owner approval required
1. Confirm Render service **alphine-aca-phase2-reviewer-staging** (`srv-dc0ibfuc6qcc73ef4m70`), not production. Its configured branch differs from the development branch and auto-deploy is OFF. Review the exact deploy commit and branch migration before any deploy.
2. Confirm secret file **filename** `github-reviewer-app.pem` and separately configured path variable `ACA_REVIEW_GITHUB_APP_PRIVATE_KEY_PATH=/etc/secrets/github-reviewer-app.pem`. Do not paste key into chat, repo, logs, or plaintext environment variables.
3. Confirm GitHub App private key corresponds to App ID **5858755**, installation ID **184252224**, and repo ID **1080201236**. Check read-only installation permissions and rotation/revocation policy. The connected GitHub connector installation **182795998** is a different identity.
4. Preserve reviewer signing and all autonomous actions **OFF**. Use an isolated, authenticated read-only smoke test only, with rollback to the prior Render deploy if validation fails.
5. Validate /health and one bounded authenticated GitHub token/PR read in staging; redact token, JWT and PEM from all logs. Confirm failure modes (missing secret, invalid installation, unauthorized repository) remain blocked.
6. Explicitly authorize the specific staging deployment before performing it. Do not merge protected PR #27 or deploy production.

## Residual limitations
Offline CI does not verify Render secret-file mount, live GitHub App installation token, private key custody, independent reviewer identity, signing safety, or real TLS ingress. No operational GO until those are independently verified.
