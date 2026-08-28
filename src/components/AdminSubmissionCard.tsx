"use client";

import { useState } from "react";

interface Submission {
  id: string;
  reportDate: string;
  tasksDone: number;
  inReview: number;
  inProgress: number;
  overdueTasks: number;
  overdueDependencies: number;
  editCount: number;
  editedAt: Date | null;
  finalReport: string;
  user?: { name: string; email: string } | null;
}

interface Props {
  submission: Submission;
  canEdit?: boolean;
  compact?: boolean;
}

export default function AdminSubmissionCard({ submission: s, canEdit, compact }: Props) {
  const [open, setOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [report, setReport] = useState(s.finalReport);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  async function saveEdit() {
    setSaving(true);
    try {
      const res = await fetch(`/api/submissions/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finalReport: report, changeNote: "Admin edit" }),
      });
      if (res.ok) {
        setSavedMsg("Saved!");
        setEditMode(false);
        setTimeout(() => setSavedMsg(""), 3000);
      } else {
        const d = (await res.json()) as { error?: string };
        setSavedMsg(d.error ?? "Error");
      }
    } finally {
      setSaving(false);
    }
  }

  if (compact) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.6rem 0.75rem",
          background: "var(--color-surface-2)",
          borderRadius: "var(--radius-sm)",
          gap: 8,
          flexWrap: "wrap",
        }}
        id={`sub-compact-${s.id}`}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontWeight: 600, fontSize: "0.8rem" }}>{s.reportDate}</span>
          {s.user && <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>{s.user.name}</span>}
        </div>
        <div style={{ display: "flex", gap: 6, fontSize: "0.72rem", color: "#64748b" }}>
          <span>✅{s.tasksDone}</span>
          <span>🔁{s.inReview}</span>
          <span>⚙️{s.inProgress}</span>
          {s.overdueTasks > 0 && <span style={{ color: "var(--color-danger)" }}>⚠️{s.overdueTasks}</span>}
          {s.editCount > 0 && <span className="badge badge-muted">edited ×{s.editCount}</span>}
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setOpen((o) => !o)}
          id={`toggle-sub-${s.id}`}
        >
          {open ? "Hide" : "View"}
        </button>
        {open && (
          <div style={{ width: "100%", marginTop: 8 }}>
            <pre style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", whiteSpace: "pre-wrap", color: "#cbd5e1", margin: 0 }}>
              {report}
            </pre>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="card-sm"
      style={{ border: "1px solid rgba(255,255,255,0.07)" }}
      id={`sub-card-${s.id}`}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>
            {s.user?.name ?? "Unknown"}
          </span>
          <span style={{ fontSize: "0.75rem", color: "#64748b", marginLeft: 8 }}>
            {s.user?.email}
          </span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {s.editCount > 0 && <span className="badge badge-warning">edited ×{s.editCount}</span>}
          {canEdit && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setEditMode((m) => !m)}
              id={`edit-sub-${s.id}`}
            >
              {editMode ? "Cancel" : "✏️ Edit"}
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        {[
          { label: "Done", val: s.tasksDone, color: "var(--color-success)" },
          { label: "Review", val: s.inReview, color: "var(--color-warning)" },
          { label: "Progress", val: s.inProgress, color: "var(--color-info)" },
          { label: "Overdue", val: s.overdueTasks, color: "var(--color-danger)" },
          { label: "Dep-OD", val: s.overdueDependencies, color: "var(--color-danger)" },
        ].map((item) => (
          <div key={item.label} className="stat-card" style={{ padding: "0.4rem 0.75rem", minWidth: 70 }}>
            <span className="stat-value" style={{ fontSize: "1.1rem", color: item.color }}>{item.val}</span>
            <span className="stat-label" style={{ fontSize: "0.65rem" }}>{item.label}</span>
          </div>
        ))}
      </div>

      {editMode ? (
        <div>
          <textarea
            className="textarea input-mono"
            value={report}
            onChange={(e) => setReport(e.target.value)}
            rows={12}
            id={`edit-report-${s.id}`}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={saving} id={`save-edit-${s.id}`}>
              {saving ? <><span className="spinner" /> Saving…</> : "Save edit"}
            </button>
            {savedMsg && <span style={{ fontSize: "0.8rem", color: "var(--color-success)", alignSelf: "center" }}>{savedMsg}</span>}
          </div>
        </div>
      ) : (
        <pre style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", whiteSpace: "pre-wrap", color: "#cbd5e1", margin: 0, padding: "0.75rem", background: "var(--color-surface-0)", borderRadius: "var(--radius-sm)" }}>
          {report}
        </pre>
      )}
    </div>
  );
}
