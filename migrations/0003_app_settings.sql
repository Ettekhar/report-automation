-- 0003_app_settings.sql: Superadmin-controlled application settings (key/value JSON)
-- Seed default: autoSaveOnGenerate = true (save the report when "Generate report" is clicked)

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT OR IGNORE INTO app_settings (key, value) VALUES ('autoSaveOnGenerate', 'true');