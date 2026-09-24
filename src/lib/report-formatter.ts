/**
 * Report Formatter — the single source of truth for the daily report format.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  To change the report format: edit REPORT_CONFIG below.             │
 * │  Do NOT touch generateReport() or the submission API route.         │
 * └─────────────────────────────────────────────────────────────────────┘
 */

// ---------------------------------------------------------------------------
// Configuration — edit this object to change the report format
// ---------------------------------------------------------------------------
export const REPORT_CONFIG = {
  /** Opening line of every report */
  header: "Here are the details of our tasks for today:",

  /** Labels for each field (change wording here if needed) */
  labels: {
    reportDate: "Report",
    totalAssigned: "Total Assigned tasks on Click-Up",
    tasksDone: "Tasks Done",
    inReview: "In review",
    inProgress: "In Progress",
    overdueTasks: "Over Due Tasks",
    overdueDependencies: "Over Due Tasks (Dependencies)",
    teamLinks: "Total {n} development task",
    tomorrowPlan: "Tomorrow’s Team Plan/Tasks on Click-Up",
    maintenanceOngoing: "* Maintenance is on-going*",
    maintenanceTotal: "Total Maintenance completed",
  },

  /** Whether to zero-pad single-digit numbers (e.g. "01" instead of "1") */
  zeroPad: true,

  /** Closing suffix after the tomorrow count */
  tomorrowSuffix: "(We will work on these tasks tomorrow)",

  /**
   * Keywords used to classify a ClickUp task title as a development task.
   * A task counts toward "Total {n} development task" when its title contains
   * any of these (case-insensitive, single words match on word boundaries).
   */
  developmentKeywords: [
    "build", "development", "dev", "homepage", "home page", "website",
    "web", "wordpress", "design", "site", "microsite", "frontend",
    "backend", "landing", "code", "coding", "theme", "plugin", "app",
    "ui", "ux",
  ],
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ReportInput {
  /** ISO date string YYYY-MM-DD */
  date: string;
  totalAssigned?: number | null;
  tasksDone: number;
  /**
   * One or more ClickUp task URLs for completed tasks, one per line.
   * Replaces the old single-string `tasksDoneLink`.
   * Legacy single-string values are still accepted (split on newline).
   */
  tasksDoneLinks?: string[] | null;
  /** @deprecated Use tasksDoneLinks instead. Kept for backward compat. */
  tasksDoneLink?: string | null;
  inReview: number;
  inProgress: number;
  overdueTasks: number;
  overdueDependencies: number;
  overdueDepNote?: string | null;
  tomorrowCount?: number | null;
  /**
   * The shared team dev task links (overdue dependency section), each carrying
   * the ClickUp task title captured at sync time for keyword classification.
   */
  teamTaskLinks: Array<{ url: string; name?: string | null }>;
  /** Whether maintenance is currently running (toggle ON/OFF) */
  maintenanceEnabled?: boolean;
  /** Running total of maintenance tasks completed today */
  maintenanceTotal?: number | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function pad(n: number, zeroPad: boolean): string {
  return zeroPad ? String(n).padStart(2, "0") : String(n);
}

function formatDateLabel(iso: string): string {
  const [y, m, d] = iso.split("-");
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${d} ${months[parseInt(m, 10) - 1]} ${y}`;
}

/**
 * Keyword-classify a ClickUp task title as a development task.
 * - A task with no title at all (legacy/manual links) counts as dev so it is
 *   never silently dropped from the report.
 * - Single-word keywords match on word boundaries; multi-word keywords match
 *   as plain substrings. Matching is case-insensitive.
 */
export function isDevelopmentTask(title: string | null | undefined): boolean {
  if (!title) return true;
  const t = title.toLowerCase();
  return REPORT_CONFIG.developmentKeywords.some((kw) => {
    if (kw.includes(" ")) return t.includes(kw.toLowerCase());
    return new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(
      t
    );
  });
}

/**
 * Resolve the unified done-links array from either `tasksDoneLinks`
 * (new) or the legacy `tasksDoneLink` string.
 */
export function resolveDoneLinks(input: ReportInput): string[] {
  if (input.tasksDoneLinks && input.tasksDoneLinks.length > 0) {
    return input.tasksDoneLinks.flatMap((s) =>
      s.split(/[\r\n]+/).map((u) => u.trim()).filter(Boolean)
    );
  }
  if (input.tasksDoneLink) {
    return input.tasksDoneLink
      .split(/[\r\n]+/)
      .map((u) => u.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * The dependencies count derivation used by the report:
 * derived from the actual linked tasks so the number always matches the
 * list, falling back to the typed value when no links are configured.
 * Shared with the submission store routes so the saved DB column matches
 * the generated report text.
 */
export function deriveDependenciesCount(input: ReportInput): number {
  return input.teamTaskLinks.length > 0
    ? input.teamTaskLinks.length
    : input.overdueDependencies;
}

// ---------------------------------------------------------------------------
// Main generator — pure function, no side effects
// ---------------------------------------------------------------------------
export function generateReport(input: ReportInput): string {
  const cfg = REPORT_CONFIG;
  const z = cfg.zeroPad;
  const lines: string[] = [];

  lines.push(cfg.header + " \n");
  lines.push(`${cfg.labels.reportDate}: ${formatDateLabel(input.date)}`);

  const totalAssigned =
    input.totalAssigned != null
      ? input.totalAssigned
      : input.tasksDone + input.inReview + input.inProgress;

  lines.push(`${cfg.labels.totalAssigned} = ${totalAssigned}`);

  // ── Tasks Done ─────────────────────────────────────────────────────────
  lines.push(`${cfg.labels.tasksDone} = ${pad(input.tasksDone, z)}`);

  // All completed-task URLs, one per line
  const doneLinks = resolveDoneLinks(input);
  doneLinks.forEach((url) => lines.push(url));

  // ── Maintenance block (when toggle is ON) ─────────────────────────────
  if (input.maintenanceEnabled) {
    lines.push("");
    lines.push(cfg.labels.maintenanceOngoing);
    const total = input.maintenanceTotal ?? 0;
    lines.push(`${cfg.labels.maintenanceTotal} - ${total}`);
    lines.push("");
  }

  // ── Status counts ──────────────────────────────────────────────────────
  lines.push(`${cfg.labels.inReview} = ${input.inReview}`);
  lines.push(`${cfg.labels.inProgress} = ${input.inProgress}`);
  lines.push(
    `${cfg.labels.overdueTasks} = ${pad(input.overdueTasks, z)}`
  );

  lines.push("");

  // The dependencies count is derived from the actual linked tasks so the
  // number always matches the list below. Falls back to the typed value when
  // no links are configured (e.g. departments with no task links yet).
  const depsCount = deriveDependenciesCount(input);
  const depLine =
    `${cfg.labels.overdueDependencies} = ${pad(depsCount, z)}` +
    (input.overdueDepNote ? ` ${input.overdueDepNote}` : "");
  lines.push(depLine);

  // ── Team dev task links ────────────────────────────────────────────────
  // The label counts only development-classified tasks, but the list below
  // shows ALL overdue task links (dev + non-dev) so nothing is hidden.
  const devCount = input.teamTaskLinks.filter((l) =>
    isDevelopmentTask(l.name)
  ).length;
  const linkCount = input.teamTaskLinks.length;
  lines.push(cfg.labels.teamLinks.replace("{n}", String(devCount)));
  if (linkCount > 0) {
    input.teamTaskLinks.forEach((l) => {
      const label = l.name ? `${l.url} — (${l.name})` : l.url;
      lines.push(label);
    });
  }

  lines.push("");

  // ── Tomorrow plan ──────────────────────────────────────────────────────
  const tomorrow = input.tomorrowCount ?? input.inProgress;
  lines.push(
    `${cfg.labels.tomorrowPlan} = ${tomorrow} ${cfg.tomorrowSuffix}`
  );

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Fine-tuning export record shape (used by /api/export)
// ---------------------------------------------------------------------------
export interface FineTuningRecord {
  id: string;
  date: string;
  user_email: string;
  user_name: string;
  raw_input: Record<string, unknown>;
  final_report: string;
  edited: boolean;
  edit_count: number;
  created_at: string;
}
