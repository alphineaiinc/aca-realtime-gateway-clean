# Phase 2 owner notifications

This draft workflow watches **only Issue #118** and comments when an existing checklist line changes from unchecked to checked, or when a newly introduced explicit owner-action marker appears.

For a manual intervention request, add a line exactly like:
`<!-- phase2-owner-action: Approval needed for staging secret activation on PR #123 -->`

Remove an obsolete marker before adding a new request. Do not add such a marker for routine test failures that can be corrected automatically.

**Important:** The workflow does not complete tasks, merge PRs, deploy, activate credentials, or dispatch agents. The checklist is changed only after acceptance evidence has been verified separately. Comments notify issue subscribers according to their GitHub notification settings. For a direct mention, set repository Actions variable `PHASE2_NOTIFY_LOGIN` to the intended GitHub username after confirming it; do not put a token or email address there.

Security/limitations: Issue-edit events must originate from trusted editors; review who has issue-write access. The diff-based detector relies on stable checklist wording. Renaming a checked line may generate a false completion notification; avoid editing checklist text when closing an item. GitHub issue events can be delayed or skipped, so this is a notification convenience, not an audit source. No notifications will be active until the PR is approved and merged. Test on a disposable issue in a controlled follow-up before relying on it.
