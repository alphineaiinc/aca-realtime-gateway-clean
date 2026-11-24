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
 operation text NOT NULL CHECK(operation IN ('provider.activate','github.write','agent.dispatch','merge','deploy','sign','secret.change','database.write','queue.recover')),
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
 subject text CHECK(subject IS NULL OR length(subject) BETWEEN 1 AND 2000),
 developer_role text CHECK(developer_role IS NULL OR developer_role IN ('backend-developer','frontend-developer')),
 CHECK((subject IS NULL)=(developer_role IS NULL)),
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

-- Disposable fixture proposal bodies only. Live retention requires separate
-- data classification, redaction, access and deletion acceptance.
CREATE TABLE engineering_team_fixture_proposals (
 task_id uuid PRIMARY KEY REFERENCES engineering_team_proposal_receipts(task_id),
 body text NOT NULL CHECK(octet_length(body) BETWEEN 1 AND 32768),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- Bind each fixture task to its workflow before execution, not after completion.
ALTER TABLE engineering_team_tasks ADD COLUMN workflow_id uuid REFERENCES engineering_team_workflows(id), ADD COLUMN workflow_step integer CHECK(workflow_step BETWEEN 0 AND 7), ADD CHECK((workflow_id IS NULL)=(workflow_step IS NULL)), ADD UNIQUE(workflow_id,workflow_step);

-- Offline connectivity reservation, never a provider execution grant.
CREATE TABLE engineering_team_provider_attempts (
 binding text PRIMARY KEY CHECK(binding ~ '^[a-f0-9]{64}$'),
 approval_id uuid NOT NULL UNIQUE REFERENCES engineering_team_approval_requests(id),
 product text NOT NULL,
 repository text NOT NULL,
 head_sha text NOT NULL CHECK(head_sha ~ '^[a-f0-9]{40}$'),
 budget_id uuid NOT NULL,
 model text NOT NULL CHECK(length(model) BETWEEN 1 AND 100),
 cost_evidence_sha256 text CHECK(cost_evidence_sha256 ~ '^[a-f0-9]{64}$'),
 reserved_microusd bigint NOT NULL CHECK(reserved_microusd BETWEEN 1 AND 10000000),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(product,repository,budget_id) REFERENCES engineering_team_spend_budgets(product,repository,budget_id)
);

-- Fixture reconciliation only. No refunds, no automatic retry, no live authorization.
CREATE TABLE engineering_team_provider_outcomes (
 binding text PRIMARY KEY REFERENCES engineering_team_provider_attempts(binding),
 outcome text NOT NULL CHECK(outcome IN ('completed','unknown','breach')),
 input_tokens integer CHECK(input_tokens>=0),
 output_tokens integer CHECK(output_tokens>=0),
 actual_microusd bigint CHECK(actual_microusd>=0),
 recorded_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK ((outcome='unknown' AND input_tokens IS NULL AND output_tokens IS NULL AND actual_microusd IS NULL) OR
 (outcome IN ('completed','breach') AND input_tokens IS NOT NULL AND output_tokens IS NOT NULL AND actual_microusd IS NOT NULL))
);

-- Offline continuation receipt. Consumed events are never automatically replayed.
CREATE TABLE engineering_team_ci_events (
 product text NOT NULL,
 repository text NOT NULL,
 head_sha text NOT NULL CHECK(head_sha ~ '^[a-f0-9]{40}$'),
 workflow_id bigint NOT NULL CHECK(workflow_id>0),
 run_id bigint NOT NULL CHECK(run_id>0),
 attempt integer NOT NULL CHECK(attempt>0),
 actor_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(repository,workflow_id,run_id,attempt)
);

-- Offline correction cycle admission: never replay after unknown outcomes.
CREATE TABLE engineering_team_correction_cycles (
 task_id uuid PRIMARY KEY REFERENCES engineering_team_tasks(id),
 initial_digest text NOT NULL CHECK(initial_digest ~ '^[a-f0-9]{64}$'),
 actor_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- Owner-approved, single-use governance recovery audit. Recovery never grants execution.
CREATE TABLE engineering_team_governance_recoveries (
 approval_id uuid PRIMARY KEY REFERENCES engineering_team_approval_requests(id),
 product text NOT NULL,
 repository text NOT NULL,
 head_sha text NOT NULL CHECK(head_sha ~ '^[a-f0-9]{40}$'),
 action text NOT NULL CHECK(action IN ('clear-stop','clear-quarantine')),
 role text CHECK(role IS NULL OR role IN ('orchestrator','project-manager','solution-architect','backend-developer','frontend-developer','qa-testing','security-reviewer','devops')),
 evidence_sha256 text NOT NULL CHECK(evidence_sha256 ~ '^[a-f0-9]{64}$'),
 recovered_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((action='clear-stop' AND role IS NULL) OR (action='clear-quarantine' AND role IS NOT NULL))
);
