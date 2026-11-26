-- Draft only: apply to disposable CI database before any rollout.
CREATE TABLE IF NOT EXISTS aca_rate_limit_buckets (
  scope text NOT NULL CHECK (length(scope) BETWEEN 1 AND 80),
  principal_hash char(64) NOT NULL,
  reset_at timestamptz NOT NULL,
  hits integer NOT NULL CHECK (hits > 0),
  PRIMARY KEY (scope, principal_hash)
);
CREATE INDEX IF NOT EXISTS aca_rate_limit_expiry_idx ON aca_rate_limit_buckets (reset_at);
