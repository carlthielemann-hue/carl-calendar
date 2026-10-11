-- Instant Cue dispatch: one row per AgentTask sent to Manus. The PRIMARY KEY is the lock that
-- stops double clicks, retries and concurrent requests from starting duplicate (paid) Manus tasks.
CREATE TABLE IF NOT EXISTS cue_dispatches (
  agent_task_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'manus',
  cue_agent TEXT NOT NULL,
  dispatch_key TEXT NOT NULL,            -- cue-dispatch:<agentTaskId>:<attempt>, sent to the Cue as run_id
  state TEXT NOT NULL,                   -- submitting | submitted | unknown | failed | claimed
  manus_task_id TEXT,
  manus_task_url TEXT,
  requested_at TEXT NOT NULL,
  submitted_at TEXT,
  claimed_at TEXT,
  last_checked_at TEXT,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS cue_dispatches_agent ON cue_dispatches (cue_agent, state);

-- Atomic task claims (cue_claim_task): exactly one Cue run may own an AgentTask at a time.
CREATE TABLE IF NOT EXISTS cue_claims (
  agent_task_id TEXT PRIMARY KEY,
  agent TEXT NOT NULL,
  claim_token TEXT NOT NULL,
  run_id TEXT,
  claimed_at TEXT NOT NULL
);
