-- 0000_initial.sql: Team Daily Report Full Schema

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  email_verified INTEGER DEFAULT 0 NOT NULL,
  image TEXT,
  role TEXT DEFAULT 'member' NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()) NOT NULL,
  updated_at INTEGER DEFAULT (unixepoch()) NOT NULL
);

-- Sessions table (Better Auth)
CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY NOT NULL,
  expires_at INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE
);

-- Accounts table (Better Auth OAuth Google)
CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at INTEGER,
  refresh_token_expires_at INTEGER,
  scope TEXT,
  password TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  issuer TEXT
);

-- Verifications table (Better Auth)
CREATE TABLE IF NOT EXISTS verification (
  id TEXT PRIMARY KEY NOT NULL,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER,
  updated_at INTEGER
);

-- Shared Team Dev Task Links
CREATE TABLE IF NOT EXISTS team_task_links (
  id TEXT PRIMARY KEY NOT NULL,
  url TEXT NOT NULL UNIQUE,
  sort_order INTEGER DEFAULT 0 NOT NULL,
  added_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER DEFAULT (unixepoch()) NOT NULL
);

-- Schedule Assignments
CREATE TABLE IF NOT EXISTS schedule_assignments (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_date TEXT NOT NULL,
  assigned_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER DEFAULT (unixepoch()) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS schedule_user_date_idx ON schedule_assignments(user_id, assigned_date);

-- Submissions Table
CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  report_date TEXT NOT NULL,
  raw_whatsapp_text TEXT,
  raw_input TEXT NOT NULL,
  total_assigned INTEGER,
  tasks_done INTEGER DEFAULT 0 NOT NULL,
  tasks_done_link TEXT,
  in_review INTEGER DEFAULT 0 NOT NULL,
  in_progress INTEGER DEFAULT 0 NOT NULL,
  overdue_tasks INTEGER DEFAULT 0 NOT NULL,
  overdue_dependencies INTEGER DEFAULT 0 NOT NULL,
  overdue_dep_note TEXT,
  tomorrow_count INTEGER,
  final_report TEXT NOT NULL,
  edited_by TEXT REFERENCES users(id),
  edited_at INTEGER,
  edit_count INTEGER DEFAULT 0 NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS submission_user_date_idx ON submissions(user_id, report_date);

-- Submission Edits (Append-only Audit Log)
CREATE TABLE IF NOT EXISTS submission_edits (
  id TEXT PRIMARY KEY NOT NULL,
  submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  edited_by TEXT NOT NULL REFERENCES users(id),
  edited_at INTEGER DEFAULT (unixepoch()) NOT NULL,
  previous_raw_input TEXT NOT NULL,
  previous_report TEXT NOT NULL,
  change_note TEXT
);

-- Seed default initial dev task links from previous tool
INSERT OR IGNORE INTO team_task_links (id, url, sort_order, created_at) VALUES
  ('link-1', 'https://app.clickup.com/t/10554421/868hngmk8', 0, unixepoch()),
  ('link-2', 'https://app.clickup.com/t/10554421/868hngmj2', 1, unixepoch()),
  ('link-3', 'https://app.clickup.com/t/10554421/868j7v43c', 2, unixepoch()),
  ('link-4', 'https://app.clickup.com/t/10554421/868jrzn2u', 3, unixepoch()),
  ('link-5', 'https://app.clickup.com/t/10554421/868jrzn30', 4, unixepoch()),
  ('link-6', 'https://app.clickup.com/t/10554421/868jrzn3y', 5, unixepoch()),
  ('link-7', 'https://app.clickup.com/t/10554421/868jrzn48', 6, unixepoch()),
  ('link-8', 'https://app.clickup.com/t/10554421/868jrzn49', 7, unixepoch()),
  ('link-9', 'https://app.clickup.com/t/10554421/868jrzn3r', 8, unixepoch());
