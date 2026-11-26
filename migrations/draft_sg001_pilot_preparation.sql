-- Draft only. Apply solely to separately authorized disposable database.
CREATE TABLE sg001_pilot_preparation (
 run_id text PRIMARY KEY CHECK (run_id ~ '^[A-Za-z0-9_-]{1,80}$'),
 binding text NOT NULL UNIQUE CHECK (binding ~ '^[a-f0-9]{64}$'),
 receipt jsonb NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK ((receipt->>'runId' = run_id) IS TRUE),
 CHECK ((receipt->>'binding' = binding) IS TRUE),
 CHECK ((receipt->>'domain' = 'sg001-pilot-preparation-record-v1') IS TRUE),
 CHECK ((receipt->>'status' = 'recorded-preparation') IS TRUE),
 CHECK ((receipt->'executionAuthorized' = 'false'::jsonb) IS TRUE),
 CHECK ((receipt->'releaseAuthorized' = 'false'::jsonb) IS TRUE)
);
