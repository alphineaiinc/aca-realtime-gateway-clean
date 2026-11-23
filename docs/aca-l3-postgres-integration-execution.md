# ACA-L3: disposable PostgreSQL integration test execution

This suite is **opt-in** and is not executed by the default unit-test CI job. The default CI syntax-checks tracked JavaScript files, but that is not a substitute for running SQL assertions.

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

**Current execution evidence:** no disposable PostgreSQL runtime was available in the development tool environment; the tests have been authored, but **not executed against PostgreSQL**. CI may verify JavaScript syntax and existing mock tests only. Execute these tests on an approved disposable local database before marking this acceptance gate complete.
