-- 0002_department_scoping_and_tasks.sql: Add department_id to team_task_links

ALTER TABLE team_task_links ADD COLUMN department_id TEXT REFERENCES departments(id) ON DELETE CASCADE;
