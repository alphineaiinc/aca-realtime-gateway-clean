# ACA-L3: disposable PostgreSQL integration test execution

This suite is **opt-in locally**. Draft PR #138 now also configures its ACA CI job to run the suite against an ephemeral PostgreSQL 17 service container (not Neon or any external database). The CI integration result must be checked at the exact head commit before claiming these SQL tests passed.

Run only against a **local disposable PostgreSQL database**, whose name begins with `aca_test_`. Do not use Neon production, staging, shared databases, or existing tenant data.

PowerShell example, after creating a disposable local database and installing dependencies:

```powershell
$env:ACA_TEST_DATABASE_URL = "postgresql://localhost:5432/aca_test_notification_outbox"
$env:ACA_TEST_DATABASE_CONFIRM = "DISPOSABLE_ONLY"
node --test integration/aca-l3-postgres.test.js
Remove-Item Env:ACA_TEST_DATABASE_URL
Remove-Item Env:ACA_TEST_DATABASE_CONFIRM
```

The test runner refuses missing confirmation, non-loopback hosts, and databases not named `aca_test_*`. It creates isolated fixture rows and uses migrations 009 and 010. The test database must be disposable because it also creates and removes a temporary failure-injection trigger.

Acceptance: concurrent claims, stale lease fencing, exhausted retries, duplicate confirmed intake, atomic notification enqueue and rollback on SQL failure. The test does **not** send SMS or email.

**Current execution evidence:** the isolated PostgreSQL CI service was added in the draft workflow; its first run is pending verification. Do not claim PostgreSQL acceptance until that exact-head CI job succeeds.
