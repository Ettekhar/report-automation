"use client";

/**
 * SEO Submission Form — a SEPARATE form for members of the SEO department.
 *
 * Structurally similar to SubmissionForm but collects only the fields the SEO
 * report format needs: completed / in-review / in-progress / overdue, each
 * with its own link list. No maintenance, no dependencies, no shared dev
 * links, no tomorrow count.
 *
 * This component is only rendered for SEO-department members, so the dev-team
 * form and its behaviour are untouched.
 */

import { useState, useEffect } from "react";
import { parseSeoMessage, resolveSeoCount } from "@/lib/parse-seo-messages";
import { generateSeoReport } from "@/lib/seo-report-formatter";

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

interface SeoFieldValues {
  tasksDone: string | number;
  tasksDoneLinks: string;
  inReview: string | number;
  inReviewLinks: string;
  inProgress: string | number;
  inProgressLinks: string;
  overdue: string | number;
  overdueLinks: string;
}

const EMPTY: SeoFieldValues = {
  tasksDone: "",
  tasksDoneLinks: "",
  inReview: "",
  inReviewLinks: "",
  inProgress: "",
  inProgressLinks: "",
  overdue: "",
  overdueLinks: "",
};

function toLines(s: string): string[] {
  return s.split(/[\r\n]+/).map((x) => x.trim()).filter(Boolean);
}
function toText(arr: string[]): string {
  return arr.join("\n");
}
/**
 * Blank count field -> null, which tells the server "no number was given, count
 * the links". A typed 0 stays 0 and is reported as 0.
 */
function num(v: string | number): number | null {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export default function SeoSubmissionForm({
  reportDate,
  existingSubmission,
  onSaved,
}: Props) {
  const [step, setStep] = useState<"paste" | "fields" | "preview">("paste");
  const [rawText, setRawText] = useState(existingSubmission?.rawWhatsappText ?? "");
  const [fields, setFields] = useState<SeoFieldValues>(EMPTY);
  const [report, setReport] = useState(existingSubmission?.finalReport ?? "");
  const [reportEdited, setReportEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(existingSubmission?.id ?? null);
  const [status, setStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // Restore from an existing submission (edit mode)
  useEffect(() => {
    if (!existingSubmission?.rawInput) return;
    try {
      const raw = JSON.parse(existingSubmission.rawInput) || {};
      setFields({
        tasksDone: raw.tasksDone ?? "",
        tasksDoneLinks: toLines((raw.tasksDoneLinks as string[])?.join("\n") ?? raw.tasksDoneLink ?? "").join("\n"),
        inReview: raw.inReview ?? "",
        inReviewLinks: ((raw.inReviewLinks as string[]) ?? []).join("\n"),
        inProgress: raw.inProgress ?? "",
        inProgressLinks: ((raw.inProgressLinks as string[]) ?? []).join("\n"),
        overdue: raw.overdueTasks ?? "",
        overdueLinks: ((raw.overdueLinks as string[]) ?? []).join("\n"),
      });
    } catch {
      /* keep defaults */
    }
  }, [existingSubmission]);

  function parse() {
    if (!rawText.trim()) {
      setStatus({ type: "error", msg: "Paste your messages first." });
      return;
    }
    const p = parseSeoMessage(rawText);
    setFields({
      // Only fill a count when the header gave an explicit number; otherwise
      // leave it blank so the link count is used in the report.
      tasksDone: p.completed.explicitCount ?? "",
      tasksDoneLinks: toText(p.completed.links),
      inReview: p.inReview.explicitCount ?? "",
      inReviewLinks: toText(p.inReview.links),
      inProgress: p.inProgress.explicitCount ?? "",
      inProgressLinks: toText(p.inProgress.links),
      overdue: p.overdue.explicitCount ?? "",
      overdueLinks: toText(p.overdue.links),
    });
    setStatus(null);
    setStep("fields");
  }

  function buildReport(): string {
    return generateSeoReport({
      date: reportDate,
      tasksDone: num(fields.tasksDone),
      tasksDoneLinks: toLines(fields.tasksDoneLinks),
      inReview: num(fields.inReview),
      inReviewLinks: toLines(fields.inReviewLinks),
      inProgress: num(fields.inProgress),
      inProgressLinks: toLines(fields.inProgressLinks),
      overdue: num(fields.overdue),
      overdueLinks: toLines(fields.overdueLinks),
    });
  }

  function generatePreview() {
    setReport(buildReport());
    setReportEdited(false);
    setStep("preview");
  }

  function body() {
    return {
      date: reportDate,
      tasksDone: num(fields.tasksDone),
      tasksDoneLinks: toLines(fields.tasksDoneLinks),
      inReview: num(fields.inReview),
      inReviewLinks: toLines(fields.inReviewLinks),
      inProgress: num(fields.inProgress),
      inProgressLinks: toLines(fields.inProgressLinks),
      overdueTasks: num(fields.overdue),
      overdueLinks: toLines(fields.overdueLinks),
      rawWhatsappText: rawText || null,
      // SEO has no maintenance / dependency / tomorrow-count concepts.
      maintenanceEnabled: false,
      maintenanceTotal: null,
      overdueDependencies: 0,
      teamTaskLinks: [],
    };
  }

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch(savedId ? `/api/submissions/${savedId}` : "/api/submissions", {
        method: savedId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body(), finalReport: report }),
      });
      const data = (await res.json()) as {
        id?: string;
        finalReport?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Save failed");
      setSavedId(data.id ?? savedId);
      onSaved?.(data.id ?? savedId ?? "", data.finalReport ?? report);
      setStatus({ type: "success", msg: "Saved." });
    } catch (e) {
      setStatus({ type: "error", msg: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  const linkField = (
    key: "tasksDoneLinks" | "inReviewLinks" | "inProgressLinks" | "overdueLinks",
    label: string,
    countKey: "tasksDone" | "inReview" | "inProgress" | "overdue"
  ) => {
    const links = toLines(fields[key]);
    const typed = fields[countKey];
    const parsed = num(typed);
    const effective = parsed !== null ? parsed : links.length;
    return (
      <div className="field" style={{ marginBottom: "1rem" }}>
        <label className="label" htmlFor={`seo-${key}`}>{label}</label>
        <input
          id={`seo-count-${key}`}
          type="number"
          className="input"
          min={0}
          style={{ marginBottom: 6, maxWidth: 160 }}
          value={typed}
          onChange={(e) => setFields((f) => ({ ...f, [countKey]: e.target.value }))}
          placeholder={`auto (${links.length})`}
        />
        <textarea
          id={`seo-${key}`}
          className="textarea input-mono"
          rows={3}
          value={fields[key]}
          onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
          placeholder="https://app.clickup.com/t/..."
        />
        <p style={{ fontSize: "0.75rem", color: "#64748b", marginTop: 4 }}>
          {links.length} link{links.length === 1 ? "" : "s"} &rarr; count{" "}
          <strong>{effective}</strong>
          {parsed !== null ? " (typed)" : " (from links)"}
        </p>
      </div>
    );
  };

  return (
    <div>
      {/* Steps */}
      <div style={{ display: "flex", gap: 8, marginBottom: "1.25rem", flexWrap: "wrap" }}>
        {(["paste", "fields", "preview"] as const).map((s, i) => (
          <button
            key={s}
            className="btn"
            onClick={() => {
              if (s === "fields" && step === "paste" && !rawText.trim()) return;
              setStep(s);
            }}
            disabled={(s === "fields" && step === "paste" && !rawText.trim()) || (s === "preview" && step === "paste")}
            style={{
              fontWeight: step === s ? 700 : 400,
              opacity: step === s ? 1 : 0.6,
              borderColor: step === s ? "var(--color-brand-500, #6366f1)" : undefined,
            }}
          >
            {i + 1}. {s === "paste" ? "Paste" : s === "fields" ? "Details" : "Preview"}
          </button>
        ))}
      </div>

      {/* Step 1 — Paste */}
      {step === "paste" && (
        <div>
          <div className="field" style={{ marginBottom: "1rem" }}>
            <label className="label" htmlFor="seo-raw">Paste your messages</label>
            <textarea
              id="seo-raw"
              className="textarea input-mono"
              rows={10}
              placeholder={"in progress:\nhttps://app.clickup.com/t/...\nCompleted:\nhttps://app.clickup.com/t/...\nOverdue:\nhttps://app.clickup.com/t/..."}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
            />
            <p style={{ fontSize: "0.75rem", color: "#64748b", marginTop: 4 }}>
              Sections can be in any order. If you write a number beside a heading
              (e.g. <code>Completed: 3</code>) that number is used; otherwise the
              links are counted.
            </p>
          </div>
          <button className="btn btn-primary" onClick={parse}>✨ Parse messages &rarr;</button>
        </div>
      )}

      {/* Step 2 — Fields */}
      {step === "fields" && (
        <div>
          <p style={{ fontSize: "0.82rem", color: "#64748b", marginBottom: "1rem" }}>
            Auto-filled from your messages. Leave a count blank to use the link count.
          </p>
          <div className="card-sm">
            {linkField("tasksDoneLinks", "Completed tasks", "tasksDone")}
            {linkField("inReviewLinks", "In review", "inReview")}
            {linkField("inProgressLinks", "In progress", "inProgress")}
            {linkField("overdueLinks", "Overdue", "overdue")}
          </div>
          <button className="btn btn-primary" onClick={generatePreview}>
            Generate report &rarr;
          </button>
        </div>
      )}

      {/* Step 3 — Preview */}
      {step === "preview" && (
        <div>
          <div className="field" style={{ marginBottom: "1rem" }}>
            <label className="label" htmlFor="seo-report">Report preview (editable)</label>
            <textarea
              id="seo-report"
              className="textarea input-mono"
              rows={22}
              value={report}
              onChange={(e) => { setReport(e.target.value); setReportEdited(true); }}
            />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" onClick={() => { setReport(buildReport()); setReportEdited(false); }}>
              Reset to generated
            </button>
            <button className="btn" onClick={() => setStep("fields")}>Back to details</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? "⏳ Saving…" : savedId ? "💾 Update report" : "💾 Save report"}
            </button>
          </div>
          {reportEdited && (
            <p style={{ fontSize: "0.75rem", color: "#f59e0b", marginTop: 8 }}>
              Report text was edited manually — your version will be saved.
            </p>
          )}
        </div>
      )}

      {status && (
        <p style={{ marginTop: "1rem", fontSize: "0.85rem", color: status.type === "error" ? "#ef4444" : "#22c55e" }}>
          {status.msg}
        </p>
      )}
    </div>
  );
}
