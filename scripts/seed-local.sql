-- Seed initial departments and users for local testing
INSERT OR IGNORE INTO departments (id, name, description, created_at, updated_at) VALUES
  ('dept_eng', 'Engineering', 'Core software development & automation team', unixepoch(), unixepoch()),
  ('dept_mkt', 'Marketing', 'Digital marketing, growth & outreach team', unixepoch(), unixepoch()),
  ('dept_ops', 'Operations', 'Business operations & support team', unixepoch(), unixepoch());

-- Insert test superadmin (matches BOOTSTRAP_ADMIN_EMAIL)
INSERT OR IGNORE INTO users (id, name, email, email_verified, role, department_id, created_at, updated_at) VALUES
  ('usr_superadmin', 'Taion (Superadmin)', 'Taion@razibmarketing.net', 1, 'superadmin', 'dept_eng', unixepoch(), unixepoch()),
  ('usr_admin', 'Sarah Admin', 'admin@example.com', 1, 'admin', 'dept_eng', unixepoch(), unixepoch()),
  ('usr_reviewer', 'Rachel Reviewer', 'reviewer@example.com', 1, 'reviewer', 'dept_mkt', unixepoch(), unixepoch()),
  ('usr_dev1', 'Alice Developer', 'alice@example.com', 1, 'member', 'dept_eng', unixepoch(), unixepoch()),
  ('usr_dev2', 'Bob Marketer', 'bob@example.com', 1, 'member', 'dept_mkt', unixepoch(), unixepoch()),
  ('usr_unassigned', 'Charlie Newcomer', 'charlie@example.com', 1, 'member', NULL, unixepoch(), unixepoch());
