"use client";

import { useState, useEffect } from "react";
import { parseMessages, extractStatusCounts, extractLinks } from "@/lib/parse-messages";
import { generateReport } from "@/lib/report-formatter";
import type { ReportInput } from "@/lib/report-formatter";

interface TeamLink { id: string; url: string; sortOrder: number; }

interface Props {
  reportDate: string;
  isAdmin?: boolean;
  existingSubmission?: {
    id: string;
    rawInput: string;
    finalReport: string;
    rawWhatsappText?: string;
  } | null;
  onSaved?: (id: string, report: string) => void;
}

interface FormFieldValues {
  totalAssigned: string | number;
  tasksDone: number;
  tasksDoneLink: string;
  inReview: number;
  inProgress: number;
  overdueTasks: number;
  overdueDependencies: number;
  overdueDepNote: string;
  tomorrowCount: string | number;
}

export default function SubmissionForm({ reportDate, isAdmin, existingSubmission, onSaved }: Props) {
  const [step, setStep] = useState<"paste" | "fields" | "preview">("paste");
  const [rawText, setRawText] = useState(existingSubmission?.rawWhatsappText ?? "");
  const [parsedLinks, setParsedLinks] = useState<string[]>([]);
  const [teamLinks, setTeamLinks] = useState<TeamLink[]>([]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [report, setReport] = useState(existingSubmission?.finalReport ?? "");
  const [reportEdited, setReportEdited] = useState(false);

  // Form fields
  const initRaw = existingSubmission && existingSubmission.rawInput ? (() => {
    try {
      return JSON.parse(existingSubmission.rawInput) || {};
    } catch {
      return {};
    }
  })() : {};

  const [fields, setFields] = useState<FormFieldValues>({
    totalAssigned: initRaw.totalAssigned ?? "",
    tasksDone: initRaw.tasksDone ?? 0,
    tasksDoneLink: initRaw.tasksDoneLink ?? "",
    inReview: initRaw.inReview ?? 0,
    inProgress: initRaw.inProgress ?? 0,
    overdueTasks: initRaw.overdueTasks ?? 0,
    overdueDependencies: initRaw.overdueDependencies ?? 0,
    overdueDepNote: initRaw.overdueDepNote ?? "",
    tomorrowCount: initRaw.tomorrowCount ?? "",
  });

  // Load team links
  useEffect(() => {
    fetch("/api/team-links")
      .then((r) => r.json())
      .then((data: unknown) => setTeamLinks(Array.isArray(data) ? (data as TeamLink[]) : []))
      .catch(() => {});
  }, []);

  function parseWhatsApp() {
    if (!rawText.trim()) { setStep("fields"); return; }
    const blocks = parseMessages(rawText);
    const counts = extractStatusCounts(blocks);
    const links = extractLinks(rawText);

    setFields((f) => ({
      ...f,
      inReview: counts.inReview,
      inProgress: counts.inProgress,
      tasksDone: counts.done,
      overdueDependencies: counts.overdueDependencies,
      overdueTasks: counts.overdue,
      tomorrowCount: counts.inProgress,
    }));
    setParsedLinks(links);
    setStep("fields");
  }

  function buildInput(): ReportInput {
    return {
      date: reportDate,
      totalAssigned: fields.totalAssigned !== "" ? Number(fields.totalAssigned) : null,
      tasksDone: Number(fields.tasksDone),
      tasksDoneLink: fields.tasksDoneLink || null,
      inReview: Number(fields.inReview),
      inProgress: Number(fields.inProgress),
      overdueTasks: Number(fields.overdueTasks),
      overdueDependencies: Number(fields.overdueDependencies),
      overdueDepNote: fields.overdueDepNote || null,
      tomorrowCount: fields.tomorrowCount !== "" ? Number(fields.tomorrowCount) : null,
      teamTaskLinks: teamLinks.map((l) => l.url),
    };
  }

  function generatePreview() {
    setReport(generateReport(buildInput()));
    setReportEdited(false);
    setStep("preview");
  }

  async function handleSave() {
    setSaving(true);
    setStatus(null);
    try {
      const payload = {
        ...fields,
        date: reportDate,
        rawWhatsappText: rawText || null,
        finalReport: reportEdited ? report : undefined,
      };
      const url = existingSubmission ? `/api/submissions/${existingSubmission.id}` : "/api/submissions";
      const method = existingSubmission ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { id?: string; finalReport?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setStatus({ type: "success", msg: existingSubmission ? "Submission updated!" : "Saved successfully!" });
      if (onSaved && data.id && data.finalReport) onSaved(data.id, data.finalReport);
    } catch (e: unknown) {
      setStatus({ type: "error", msg: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  const numField = (key: keyof FormFieldValues, label: string) => (
    <div className="field">
      <label className="label" htmlFor={`field-${key}`}>{label}</label>
      <input
        id={`field-${key}`}
        type="number"
        className="input"
        value={fields[key]}
        onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
        min={0}
      />
    </div>
  );

  const textField = (key: keyof FormFieldValues, label: string, placeholder?: string) => (
    <div className="field">
      <label className="label" htmlFor={`field-${key}`}>{label}</label>
      <input
        id={`field-${key}`}
        type="text"
        className="input"
        value={fields[key] as string}
        onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
      />
    </div>
  );

  return (
    <div className="fade-in">
      {/* Step tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: "1.25rem", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "0.75rem" }}>
        {[
          { key: "paste", label: "1. Paste Messages" },
          { key: "fields", label: "2. Fill Fields" },
          { key: "preview", label: "3. Preview & Save" },
        ].map((s) => (
          <button
            key={s.key}
            className={`btn btn-sm ${step === s.key ? "btn-primary" : "btn-ghost"}`}
            onClick={() => {
              if (s.key === "preview" && step === "fields") generatePreview();
              else setStep(s.key as typeof step);
            }}
            id={`step-${s.key}-btn`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* ── Step 1: Paste ─────────────────────────────────────────── */}
      {step === "paste" && (
        <div>
          <div className="field" style={{ marginBottom: "1rem" }}>
            <label className="label" htmlFor="raw-whatsapp">Paste raw WhatsApp messages (optional)</label>
            <textarea
              id="raw-whatsapp"
              className="textarea input-mono"
              rows={10}
              placeholder={"[7:46 pm, 18/08/2026] +880 1936-579811: Daily task\nthewentworthrestaurants fixing complete + speed up\n..."}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" onClick={parseWhatsApp} id="parse-btn">
            ✨ Parse messages &rarr;
          </button>

          {parsedLinks.length > 0 && (
            <div style={{ marginTop: "1rem" }}>
              <p className="label">Links found (click to review)</p>
              {parsedLinks.map((l) => (
                <div key={l} style={{ fontSize: "0.8rem", padding: "2px 0" }}>
                  <a href={l} target="_blank" rel="noopener noreferrer">{l}</a>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Step 2: Fields ────────────────────────────────────────── */}
      {step === "fields" && (
        <div>
          <p style={{ fontSize: "0.82rem", color: "#64748b", marginBottom: "1rem" }}>
            Auto-filled from chat (edit if needed). Fields marked * come from ClickUp.
          </p>

          <div className="card-sm" style={{ marginBottom: "1rem" }}>
            <p className="label" style={{ marginBottom: "0.75rem" }}>Status counts</p>
            <div className="grid-form">
              {numField("inReview", "In Review")}
              {numField("inProgress", "In Progress")}
              {numField("tasksDone", "Completed")}
              {numField("overdueTasks", "Overdue Tasks")}
              {numField("overdueDependencies", "Overdue (Dependencies)")}
            </div>
          </div>

          <div className="card-sm" style={{ marginBottom: "1rem" }}>
            <p className="label" style={{ marginBottom: "0.75rem" }}>ClickUp fields *</p>
            <div className="grid-form">
              {numField("totalAssigned", "Total Assigned Tasks")}
              {numField("tasksDone", "Tasks Done")}
              {textField("tasksDoneLink", "Tasks Done Link", "https://app.clickup.com/t/...")}
              {numField("tomorrowCount", "Tomorrow's Plan Count")}
              {textField("overdueDepNote", "Overdue-dep note", "( all are developments task )")}
            </div>
          </div>

          {/* Team task links (read-only display) */}
          <div className="card-sm" style={{ marginBottom: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
              <p className="label" style={{ marginBottom: 0 }}>
                Team dev task links ({teamLinks.length})
              </p>
              {isAdmin && (
                <a href="/admin/users" className="btn btn-ghost btn-sm" style={{ fontSize: "0.72rem" }}>
                  Manage &rarr;
                </a>
              )}
            </div>
            {teamLinks.length === 0 ? (
              <p style={{ fontSize: "0.8rem", color: "#475569" }}>No team links yet. Admin can add them.</p>
            ) : (
              teamLinks.map((l) => (
                <div key={l.id} style={{ fontSize: "0.78rem", padding: "2px 0" }}>
                  <a href={l.url} target="_blank" rel="noopener noreferrer" style={{ wordBreak: "break-all" }}>{l.url}</a>
                </div>
              ))
            )}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => setStep("paste")} id="back-to-paste-btn">
              &larr; Back
            </button>
            <button className="btn btn-primary" onClick={generatePreview} id="generate-preview-btn">
              📄 Generate report &rarr;
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Preview & Save ────────────────────────────────── */}
      {step === "preview" && (
        <div>
          <div className="field" style={{ marginBottom: "1rem" }}>
            <label className="label" htmlFor="report-output">
              Final report
              {reportEdited && <span style={{ color: "var(--color-warning)", marginLeft: 8 }}>✏️ manually edited</span>}
            </label>
            <textarea
              id="report-output"
              className="textarea input-mono"
              rows={16}
              value={report}
              onChange={(e) => { setReport(e.target.value); setReportEdited(true); }}
            />
          </div>

          {status && (
            <div className={`alert alert-${status.type === "success" ? "success" : "error"}`} style={{ marginBottom: "1rem" }}>
              {status.msg}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-ghost" onClick={() => setStep("fields")} id="back-to-fields-btn">
              &larr; Edit fields
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
              id="save-submission-btn"
            >
              {saving ? <><span className="spinner" /> Saving…</> : <>💾 {existingSubmission ? "Update" : "Save"} submission</>}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => { navigator.clipboard.writeText(report); }}
              id="copy-report-btn"
            >
              📋 Copy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
