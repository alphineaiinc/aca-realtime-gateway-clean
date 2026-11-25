CREATE TABLE IF NOT EXISTS engineering_team_manager_observations (
  product text NOT NULL CHECK (length(product) BETWEEN 1 AND 80),
  repository text NOT NULL CHECK (length(repository) BETWEEN 1 AND 201),
  head_sha text NOT NULL CHECK (head_sha ~ '^[a-f0-9]{40}$'),
  issue bigint NOT NULL CHECK (issue > 0),
  event_key text NOT NULL CHECK (length(event_key) BETWEEN 1 AND 160),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  observation jsonb CHECK (
    jsonb_typeof(observation) = 'object' AND octet_length(observation::text) <= 32768
  ),
  PRIMARY KEY (product, repository, head_sha, issue, event_key)
);
