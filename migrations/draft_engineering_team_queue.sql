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

-- Evidence digests only until proposal retention and data classification are approved.
CREATE TABLE engineering_team_proposal_receipts (
 task_id uuid PRIMARY KEY REFERENCES engineering_team_tasks(id),
 lease_id uuid NOT NULL,
 evidence_sha256 text NOT NULL CHECK(evidence_sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- Decisions are durable evidence only; no execution authorization is inferred.
CREATE TABLE engineering_team_approval_requests (
 id uuid PRIMARY KEY,
 product text NOT NULL,
 repository text NOT NULL,
 head_sha text NOT NULL CHECK(head_sha ~ '^[a-f0-9]{40}$'),
 operation text NOT NULL CHECK(operation IN ('provider.activate','github.write','agent.dispatch','merge','deploy','sign','secret.change','database.write')),
 evidence_sha256 text NOT NULL CHECK(evidence_sha256 ~ '^[a-f0-9]{64}$'),
 binding text NOT NULL CHECK(binding ~ '^[a-f0-9]{64}$'),
 requested_by text NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','approved','denied')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 decided_by text,
 decided_at timestamptz,
 CHECK((state='pending' AND decided_by IS NULL AND decided_at IS NULL) OR
 (state IN ('approved','denied') AND decided_by IS NOT NULL AND decided_at IS NOT NULL)),
 CHECK(decided_by IS NULL OR decided_by<>requested_by),
 CHECK(expires_at>created_at)
);
CREATE INDEX engineering_team_approval_scope_idx ON engineering_team_approval_requests(product,repository,head_sha,state);

-- Nonrefundable call reservations survive crashes; no automatic reset.
CREATE TABLE engineering_team_call_budgets (
 product text NOT NULL,
 repository text NOT NULL,
 budget_id uuid NOT NULL,
 max_calls integer NOT NULL CHECK(max_calls BETWEEN 1 AND 64),
 reserved_calls integer NOT NULL DEFAULT 0 CHECK(reserved_calls>=0 AND reserved_calls<=max_calls),
 PRIMARY KEY(product,repository,budget_id)
);

-- Operator-provisioned conservative per-call ceilings; no automatic refunds.
CREATE TABLE engineering_team_spend_budgets (
 product text NOT NULL,
 repository text NOT NULL,
 budget_id uuid NOT NULL,
 max_microusd bigint NOT NULL CHECK(max_microusd BETWEEN 1 AND 10000000),
 reserved_microusd bigint NOT NULL DEFAULT 0 CHECK(reserved_microusd BETWEEN 0 AND max_microusd),
 max_calls integer NOT NULL CHECK(max_calls BETWEEN 1 AND 64),
 reserved_calls integer NOT NULL DEFAULT 0 CHECK(reserved_calls BETWEEN 0 AND max_calls),
 PRIMARY KEY(product,repository,budget_id)
);

-- Durable sequential handoff metadata. No source or proposal body retention.
CREATE TABLE engineering_team_workflows (
 id uuid PRIMARY KEY,
 product text NOT NULL,
 repository text NOT NULL,
 head_sha text NOT NULL CHECK(head_sha ~ '^[a-f0-9]{40}$'),
 next_step integer NOT NULL DEFAULT 0 CHECK(next_step BETWEEN 0 AND 8),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE engineering_team_handoffs (
 workflow_id uuid NOT NULL REFERENCES engineering_team_workflows(id),
 step integer NOT NULL CHECK(step BETWEEN 0 AND 7),
 task_id uuid NOT NULL UNIQUE REFERENCES engineering_team_proposal_receipts(task_id),
 PRIMARY KEY(workflow_id,step)
);

-- Admission reservation is not a live authorization. A consumed attempt is
-- never retried automatically, including after restart or unknown outcomes.
CREATE TABLE engineering_team_publication_attempts (
 binding text PRIMARY KEY CHECK(binding ~ '^[a-f0-9]{64}$'),
 approval_id uuid NOT NULL UNIQUE REFERENCES engineering_team_approval_requests(id),
 product text NOT NULL,
 repository text NOT NULL,
 base_sha text NOT NULL CHECK(base_sha ~ '^[a-f0-9]{40}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
