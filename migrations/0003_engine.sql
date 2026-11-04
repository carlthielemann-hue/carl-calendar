-- Scriptroom Engine (growth engine). Clean, well-named tables for the money pipe and the
-- AI-maintained backend. See docs/ENGINE_CONTRACT.md.

-- Generic entities Carl fills by chat: clients, past_work, offers, income, expenses, milestones, …
CREATE TABLE IF NOT EXISTS engine_records (
  entity TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT NOT NULL,          -- JSON
  archived INTEGER NOT NULL DEFAULT 0,
  dedupe_key TEXT,             -- normalised name/domain/email for upserts
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (entity, id)
);
CREATE INDEX IF NOT EXISTS engine_records_dedupe ON engine_records (entity, dedupe_key);

-- Every write by AI or Carl, with the previous version so it can be undone.
CREATE TABLE IF NOT EXISTS engine_activity (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,         -- 'claude' | 'routine' | 'carl' | 'system' | connected app name
  action TEXT NOT NULL,        -- add | update | archive | undo | log | approve | skip | send | …
  entity TEXT,
  ref_id TEXT,
  summary TEXT NOT NULL,
  before TEXT,
  after TEXT
);

-- One row per outgoing item (email, Upwork proposal, X/LinkedIn reply/DM).
CREATE TABLE IF NOT EXISTS outreach_items (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,       -- email | upwork | x | linkedin
  kind TEXT NOT NULL,          -- cold | followup | proposal | reply | dm
  status TEXT NOT NULL,        -- draft | pending | approved | skipped | sent | failed | blocked | cancelled
  batch_date TEXT,             -- yyyy-MM-dd (Berlin) of the batch it belongs to
  due_date TEXT,               -- follow-ups: earliest batch they may join
  to_email TEXT,
  email_source TEXT,
  to_name TEXT,
  company TEXT,
  domain TEXT,
  country TEXT,
  timezone TEXT,
  subject TEXT,
  body TEXT NOT NULL,
  variant TEXT,
  evidence TEXT,
  personalization TEXT,
  source_url TEXT,
  score INTEGER,
  score_reason TEXT,
  audit_id TEXT,
  niche TEXT,
  price_quoted REAL,
  sequence_id TEXT,
  step INTEGER NOT NULL DEFAULT 1,
  approved_hash TEXT,
  approved_at TEXT,
  sent_at TEXT,
  gmail_thread_id TEXT,
  gmail_message_id TEXT,
  outcome TEXT,                -- replied | won | lost | no_reply (win/loss analytics)
  error TEXT,
  meta TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS outreach_status ON outreach_items (status, batch_date);
CREATE INDEX IF NOT EXISTS outreach_email ON outreach_items (to_email);
CREATE INDEX IF NOT EXISTS outreach_source ON outreach_items (channel, source_url);
CREATE INDEX IF NOT EXISTS outreach_seq ON outreach_items (sequence_id);

-- An email sequence to one person (first touch + follow-ups). Any reply stops it.
CREATE TABLE IF NOT EXISTS outreach_sequences (
  id TEXT PRIMARY KEY,
  to_email TEXT NOT NULL,
  company TEXT,
  status TEXT NOT NULL,        -- active | replied | bounced | stopped | completed
  thread_id TEXT,
  first_sent_at TEXT,
  last_step INTEGER NOT NULL DEFAULT 0,
  replied_at TEXT,
  reply_snippet TEXT,
  created_at TEXT NOT NULL
);

-- Never email again.
CREATE TABLE IF NOT EXISTS suppression (
  email TEXT PRIMARY KEY,
  reason TEXT NOT NULL,        -- bounce | unsubscribe | complaint | manual
  at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS send_log (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL,
  to_email TEXT,
  ok INTEGER NOT NULL,
  error TEXT,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS send_log_at ON send_log (at);

-- Health panel: when each job last ran and whether it worked.
CREATE TABLE IF NOT EXISTS job_runs (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  job TEXT NOT NULL,
  ok INTEGER NOT NULL,
  message TEXT,
  stats TEXT,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS job_runs_job ON job_runs (job, seq);

-- Rate limit for the public teardown form.
CREATE TABLE IF NOT EXISTS public_hits (ip TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS public_hits_ip ON public_hits (ip, at);
