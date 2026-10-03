CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  engine TEXT NOT NULL CHECK(engine IN ('mysql','postgresql','sqlite')),
  status TEXT NOT NULL DEFAULT 'ready',
  created_at TEXT NOT NULL,
  storage_bytes INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
