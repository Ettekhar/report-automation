"use client";

import { useState, useEffect } from "react";

interface AppSettings {
  autoSaveOnGenerate: boolean;
}

export default function SettingsPanel() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data: unknown) => setSettings(data as AppSettings))
      .catch(() => setError("Failed to load settings"))
      .finally(() => setLoading(false));
  }, []);

  async function updateAutoSave(enabled: boolean) {
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoSaveOnGenerate: enabled }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; settings?: AppSettings };
      if (!res.ok) throw new Error(data.error ?? "Failed to update");
      if (data.settings) setSettings(data.settings);
      setSavedMsg(enabled ? "Auto-save is now ON — “Generate report” saves immediately." : "Auto-save is now OFF — users must click “Save submission”.");
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p style={{ color: "#64748b" }}>Loading settings…</p>;

  const enabled = settings?.autoSaveOnGenerate ?? true;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div className="card" style={{ maxWidth: 640 }}>
        <h2 style={{ fontSize: "1.2rem", margin: "0 0 0.25rem" }}>Report Saving Behaviour</h2>
        <p style={{ fontSize: "0.85rem", color: "#64748b", margin: "0 0 1.25rem" }}>
          Controls what happens when a team member clicks <strong>“Generate report”</strong>.
        </p>

        <div className="card-sm" style={{ marginBottom: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ fontWeight: 600 }}>Auto-save on generate</div>
              <div style={{ fontSize: "0.8rem", color: "#64748b" }}>
                {enabled
                  ? "ON — clicking “Generate report” immediately saves the submission (POST/PATCH)."
                  : "OFF — “Generate report” only previews; the user must click “Save submission”."}
              </div>
            </div>
            <label
              htmlFor="auto-save-toggle"
              style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none", flexShrink: 0 }}
            >
              <span style={{ fontSize: "0.8rem", color: enabled ? "#22c55e" : "#64748b", fontWeight: 600 }}>
                {enabled ? "ON" : "OFF"}
              </span>
              <div
                id="auto-save-toggle"
                role="switch"
                aria-checked={enabled}
                tabIndex={0}
                onClick={() => updateAutoSave(!enabled)}
                onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") updateAutoSave(!enabled); }}
                style={{
                  width: 44,
                  height: 24,
                  borderRadius: 12,
                  background: enabled ? "#6366f1" : "rgba(255,255,255,0.15)",
                  position: "relative",
                  transition: "background 0.2s",
                  cursor: "pointer",
                }}
              >
                <div style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: "#fff",
                  position: "absolute",
                  top: 3,
                  left: enabled ? 23 : 3,
                  transition: "left 0.2s",
                }} />
              </div>
              {saving && <span className="spinner" style={{ marginLeft: 4 }} />}
            </label>
          </div>
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: "0.75rem" }}>{error}</div>}
        {savedMsg && <div className="alert alert-success" style={{ marginBottom: "0.75rem" }}>{savedMsg}</div>}
      </div>
    </div>
  );
}