/**
 * SEO Report Formatter — a SEPARATE report format for the "Web SEO" department.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * ��� Dev-team reports are produced by report-formatter.ts and are NOT      │
 * │ touched by this file. This module is only reached when the           │
 * │ submitting member's department resolves to the SEO department.       │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Differences from the dev-team format:
 *   • No maintenance block
 *   • No "Over Due Tasks (Dependencies)" section
 *   • No "Total N development task" shared-link section
 *   • "In Progress" and "Overdue" both list their links
 *   • "In review" is omitted when zero
 *   • Tomorrow line is fixed prose, not a number
 */

// NOTE: this module deliberately imports NOTHING from report-formatter.ts, so
// the dev-team format can never be affected by (or leak into) SEO output.

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
export const SEO_REPORT_CONFIG = {
  header: "Here are the details of our tasks for today: ",

  labels: {
    reportDate: "Report",
    totalAssigned: "Total Assigned tasks",
    tasksDone: "Tasks Done",
    inReview: "In review",
    inProgress: "In Progress",
    overdue: "Overdue Tasks on ClickUp",
  },

  /**
   * Fixed closing line. The SEO team tracks tomorrow's work in an external
   * Monthly worksheet, so there is no tomorrow COUNT to report.
   */
  tomorrowLine:
    "Tomorrow’s Team Plan/Tasks on the Monthly worksheet and the ongoing SEO task on ClickUp.",

  /**
   * Department names (lowercased) that should receive the SEO format.
   * Matching is substring-based so "Web SEO", "web seo", "SEO" all match.
   * Add more names here if the department is ever renamed.
   */
  departmentNames: ["web seo", "seo"],
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface SeoReportInput {
  /** ISO date string YYYY-MM-DD */
  date: string;
  /**
   * Counts are nullable on purpose: `null` means "no number was written, count
   * the links instead", while an explicit `0` is a real answer and must be
   * honoured. Conflating the two would print a link count for a section the
   * member deliberately zeroed out.
   */
  tasksDone: number | null;
  tasksDoneLinks: string[];
  inReview: number | null;
  inReviewLinks?: string[];
  inProgress: number | null;
  inProgressLinks: string[];
  overdue: number | null;
  overdueLinks: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Render a count for the SEO format. No zero-padding: 0-9 print as a single
 * digit and 10+ print as two ("0 to 9 single, 10 double digit").
 * Also normalises negatives / NaN to 0 so the report can never print junk.
 */
export function seoPad(n: number): string {
  const safe = Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
  return String(safe);
}

function formatDateLabel(iso: string): string {
  const [y, m, d] = iso.split("-");
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const mi = parseInt(m, 10) - 1;
  if (Number.isNaN(mi) || !months[mi]) return iso;
  return `${parseInt(d, 10)} ${months[mi]} ${y}`;
}

/**
 * Resolve one section's count.
 *
 * The team's rule is "if number is given good, if not then we count the links".
 * A number of 0 is still a number the member wrote, so it is honoured; only
 * `null` / `undefined` / NaN falls back to counting the links.
 */
export function resolveSeoSectionCount(
  count: number | null | undefined,
  links: string[]
): number {
  if (typeof count === "number" && Number.isFinite(count)) {
    return Math.max(0, Math.trunc(count));
  }
  return links.length;
}

/**
 * True when the given department name should use the SEO report format.
 * Case-insensitive substring match against SEO_REPORT_CONFIG.departmentNames.
 */
export function isSeoDepartment(departmentName: string | null | undefined): boolean {
  if (!departmentName) return false;
  const n = departmentName.trim().toLowerCase();
  return SEO_REPORT_CONFIG.departmentNames.some((d) => n.includes(d));
}

// ---------------------------------------------------------------------------
// Main generator — pure function, no side effects
// ---------------------------------------------------------------------------
export function generateSeoReport(input: SeoReportInput): string {
  const cfg = SEO_REPORT_CONFIG;
  const lines: string[] = [];

  const doneLinks = input.tasksDoneLinks.filter(Boolean);
  const reviewLinks = (input.inReviewLinks ?? []).filter(Boolean);
  const progressLinks = input.inProgressLinks.filter(Boolean);
  const overdueLinks = input.overdueLinks.filter(Boolean);

  const doneCount = resolveSeoSectionCount(input.tasksDone, doneLinks);
  const reviewCount = resolveSeoSectionCount(input.inReview, reviewLinks);
  const progressCount = resolveSeoSectionCount(input.inProgress, progressLinks);
  const overdueCount = resolveSeoSectionCount(input.overdue, overdueLinks);

  // Total Assigned is derived: done + in-review + in-progress, which is what
  // all three supplied samples show (6+0, 10+2, 6+3).
  const totalAssigned = doneCount + reviewCount + progressCount;

  lines.push(cfg.header);
  lines.push(`${cfg.labels.reportDate}: ${formatDateLabel(input.date)}`);
  lines.push(`${cfg.labels.totalAssigned} = ${seoPad(totalAssigned)}`);
  lines.push(`${cfg.labels.tasksDone} = ${seoPad(doneCount)}`);
  doneLinks.forEach((u) => lines.push(u));

  // In review — omitted entirely when there is none.
  if (reviewCount > 0) {
    lines.push(`${cfg.labels.inReview} = ${seoPad(reviewCount)}`);
    reviewLinks.forEach((u) => lines.push(u));
  }

  lines.push(`${cfg.labels.inProgress} = ${seoPad(progressCount)}`);
  progressLinks.forEach((u) => lines.push(u));

  lines.push(`${cfg.labels.overdue} = ${seoPad(overdueCount)}`);
  overdueLinks.forEach((u) => lines.push(u));

  lines.push(cfg.tomorrowLine);

  return lines.join("\n");
}
