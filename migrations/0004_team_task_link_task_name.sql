-- 0004_team_task_link_task_name.sql: store the ClickUp task title on each
-- team dev task link so reports can keyword-classify development tasks.

ALTER TABLE team_task_links ADD COLUMN name TEXT;