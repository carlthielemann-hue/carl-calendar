-- Command Center schema v1
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT OR IGNORE INTO meta (key, value) VALUES ('rev', '0');

-- One row per synced record (see src/domain/syncSchema.ts)
CREATE TABLE IF NOT EXISTS records (
  coll TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT,               -- JSON; NULL when deleted (tombstone)
  rev INTEGER NOT NULL,     -- server revision, monotonically increasing
  updated_at TEXT NOT NULL, -- client-reported change time
  device TEXT,
  PRIMARY KEY (coll, id)
);
CREATE INDEX IF NOT EXISTS records_rev ON records (rev);

-- Losing side of a concurrent edit, kept so nothing is silently lost
CREATE TABLE IF NOT EXISTS conflicts (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  coll TEXT NOT NULL,
  id TEXT NOT NULL,
  kept TEXT,
  discarded TEXT,
  at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, user_agent TEXT);
CREATE TABLE IF NOT EXISTS login_attempts (ip TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS login_attempts_ip ON login_attempts (ip, at);

CREATE TABLE IF NOT EXISTS files (key TEXT PRIMARY KEY, name TEXT NOT NULL, mime TEXT, size INTEGER, created_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS gcal_events (
  cal_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  data TEXT NOT NULL,
  start TEXT NOT NULL,
  PRIMARY KEY (cal_id, event_id)
);
CREATE INDEX IF NOT EXISTS gcal_events_start ON gcal_events (start);

CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, sub TEXT NOT NULL, created_at TEXT NOT NULL, user_agent TEXT);
CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, url TEXT NOT NULL, created_at TEXT NOT NULL, delivered INTEGER DEFAULT 0);

-- Every external call: provider, outcome, message. Feeds the integration status screen.
CREATE TABLE IF NOT EXISTS integration_log (seq INTEGER PRIMARY KEY AUTOINCREMENT, provider TEXT NOT NULL, ok INTEGER NOT NULL, message TEXT, at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ai_usage (seq INTEGER PRIMARY KEY AUTOINCREMENT, provider TEXT NOT NULL, model TEXT, input_tokens INTEGER, output_tokens INTEGER, at TEXT NOT NULL, source TEXT);
CREATE TABLE IF NOT EXISTS manus_tasks (task_id TEXT PRIMARY KEY, client_id TEXT, title TEXT, url TEXT, status TEXT, created_at TEXT NOT NULL, result TEXT);
