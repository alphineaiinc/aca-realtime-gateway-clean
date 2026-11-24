-- Draft only: disposable CI; no automatic migration or production activation.
CREATE TABLE engineering_team_tasks (
 id uuid PRIMARY KEY,
 product text NOT NULL CHECK (length(product) BETWEEN 1 AND 80),
 repository text NOT NULL CHECK (length(repository) BETWEEN 1 AND 200),
 head_sha text NOT NULL CHECK (head_sha ~ '^[a-f0-9]{40}$'),
 state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','running','succeeded','failed','cancelled')),
 role text NOT NULL CHECK (role IN ('orchestrator','project-manager','solution-architect','backend-developer','frontend-developer','qa-testing','security-reviewer','devops')),
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 2),
 worker_id text,
 lease_id uuid,
 lease_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK ((state='running') = (worker_id IS NOT NULL AND lease_id IS NOT NULL AND lease_until IS NOT NULL)),
 CHECK (state='running' OR (worker_id IS NULL AND lease_id IS NULL AND lease_until IS NULL))
);
CREATE INDEX engineering_team_tasks_scope_idx ON engineering_team_tasks(product,repository,head_sha,state,created_at);
-- Audit metadata only; no issue text, credentials or proposal bodies.
CREATE TABLE engineering_team_queue_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 task_id uuid NOT NULL REFERENCES engineering_team_tasks(id),
 event text NOT NULL CHECK (event IN ('queued','claimed','succeeded','failed','retry','cancelled','expired')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- Scope-wide stop applies across commit revisions. No automatic resume.
CREATE TABLE engineering_team_stops (
 product text NOT NULL,
 repository text NOT NULL,
 actor_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(product,repository)
);
CREATE TABLE engineering_team_quarantine (
 product text NOT NULL,
 repository text NOT NULL,
 role text NOT NULL CHECK (role IN ('orchestrator','project-manager','solution-architect','backend-developer','frontend-developer','qa-testing','security-reviewer','devops')),
 actor_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(product,repository,role)
);
