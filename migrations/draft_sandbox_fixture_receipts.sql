-- Draft only: disposable CI; do not apply to production.
CREATE TABLE sandbox_fixture_receipts (
 attempt_id text PRIMARY KEY CHECK(attempt_id ~ '^aca-fixture-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'),
 harness_sha text NOT NULL CHECK(harness_sha ~ '^[a-f0-9]{40}$'),
 image text NOT NULL CHECK(image ~ '^node@sha256:[a-f0-9]{64}$'),
 fixture_sha256 text NOT NULL CHECK(fixture_sha256 ~ '^[a-f0-9]{64}$'),
 report_sha256 text NOT NULL UNIQUE CHECK(report_sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
