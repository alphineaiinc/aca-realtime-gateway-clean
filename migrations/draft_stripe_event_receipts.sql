-- Draft: not applied to live databases.
CREATE TABLE IF NOT EXISTS stripe_event_receipts (
 event_id text PRIMARY KEY CHECK (length(event_id) BETWEEN 5 AND 204),
 claim_id uuid NOT NULL,
 state text NOT NULL CHECK (state IN ('processing','completed','uncertain')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
