# Phase 2 GitHub connector and reviewer installation identity audit — 2026-11-21

Authenticated GitHub connector `list_installations` exposed installation ID **182795998** (repository_selection=all); `list_repositories_by_installation` for that installation exposed the ACA repository ID **1080201236**. The connector omitted App ID, App slug, account, and permissions in its installation summary. This does not establish the identity of the independent Alphine reviewer.

The separately owner-configured Alphine AI Security Reviewer App ID **5858755** and installation ID **184252224** are **different** from the connector's installation. These values are user-supplied configuration and are **not authenticated as reviewer installation identity by the current connector**. Do not infer that the connected installation is the reviewer, or that the reviewer installation is operational. The GitHub Actions CI check issuer App ID is separately pinned; it must be verified from actual authenticated check-run records, not assumed to equal the reviewer App ID.

Added `phase2GithubInstallationIdentityGate.js` and adversarial tests to reject missing or mismatched repository, reviewer App/installation, check issuer, and self-reported identity. Even fully matching simulated identities never authorize operations. The gate's source field is only a claim until independently bound to a reviewed authenticated transport.

**Next:** obtain live read-only App/installation identity and check-run issuer details from authenticated GitHub REST using separately managed credentials. Confirm reviewer key custody, then stage end-to-end verification. No secrets created, no merge, deploy, signing or dispatch.
