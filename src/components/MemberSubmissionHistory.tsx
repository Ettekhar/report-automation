"use client";

interface Submission {
  id: string;
  reportDate: string;
  tasksDone: number;
  inReview: number;
  inProgress: number;
  overdueTasks: number;
  finalReport: string;
  editCount: number;
  createdAt: Date | null;
}

export default function MemberSubmissionHistory({
  submissions,
}: {
  submissions: Submission[];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {submissions.map((s) => (
        <details
          key={s.id}
          style={{
            background: "var(--color-surface-2)",
            border: "1px solid rgba(255,255,255,0.05)",
            borderRadius: "var(--radius-md)",
          }}
        >
          <summary
            style={{
              padding: "0.75rem 1rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 8,
              listStyle: "none",
              userSelect: "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>
                {s.reportDate}
              </span>
              {s.editCount > 0 && (
                <span className="badge badge-muted">edited ×{s.editCount}</span>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, fontSize: "0.75rem", color: "#64748b" }}>
              <span>✅ Done: {s.tasksDone}</span>
              <span>🔁 Review: {s.inReview}</span>
              <span>⚙️ Progress: {s.inProgress}</span>
              {s.overdueTasks > 0 && (
                <span style={{ color: "var(--color-danger)" }}>⚠️ Overdue: {s.overdueTasks}</span>
              )}
            </div>
          </summary>
          <div style={{ padding: "0 1rem 1rem" }}>
            <pre
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.78rem",
                lineHeight: 1.7,
                color: "#cbd5e1",
                margin: 0,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {s.finalReport}
            </pre>
          </div>
        </details>
      ))}
    </div>
  );
}
