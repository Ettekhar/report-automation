"use client";

import { useState } from "react";

interface Props {
  totalCount: number;
}

export default function ExportDataset({ totalCount }: Props) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = () => {
    setDownloading(true);
    // Directly trigger file download from /api/export
    window.location.href = "/api/export";
    setTimeout(() => setDownloading(false), 2000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 style={{ fontSize: "1.2rem", margin: 0 }}>Fine-Tuning Dataset (.JSONL)</h2>
            <p style={{ fontSize: "0.85rem", color: "#64748b", margin: 0 }}>
              Export all stored (raw input &rarr; final report) pairs in clean, standard JSONL format.
            </p>
          </div>
          <span className="badge badge-success" style={{ fontSize: "0.85rem", padding: "4px 12px" }}>
            {totalCount} Total Records
          </span>
        </div>

        <div className="card-sm" style={{ marginBottom: "1.5rem" }}>
          <p className="label" style={{ marginBottom: "0.5rem" }}>Record Structure Preview</p>
          <pre
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.75rem",
              background: "var(--color-surface-0)",
              padding: "0.75rem",
              borderRadius: "var(--radius-sm)",
              overflowX: "auto",
              color: "#94a3b8",
            }}
          >{`{
  "id": "e3049ba3-...",
  "date": "2026-08-27",
  "user_email": "alice@company.com",
  "user_name": "Alice",
  "raw_input": {
    "tasksDone": 1,
    "inReview": 2,
    "inProgress": 3,
    "overdueTasks": 0,
    "overdueDependencies": 1,
    "totalAssigned": 12,
    "tomorrowCount": 3
  },
  "final_report": "Here are the details of our tasks for today: ...",
  "edited": false,
  "edit_count": 0,
  "created_at": "2026-08-27T14:30:00.000Z"
}`}</pre>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <button
            className="btn btn-primary btn-lg"
            onClick={handleDownload}
            disabled={downloading || totalCount === 0}
            id="download-jsonl-btn"
          >
            {downloading ? <><span className="spinner" /> Generating export…</> : <>📥 Download Dataset (.jsonl)</>}
          </button>
          {totalCount === 0 && (
            <span style={{ color: "#64748b", fontSize: "0.85rem" }}>
              No submissions recorded yet. Once team members submit reports, they will be downloadable here.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
