/**
 * Report-format router.
 *
 * Decides which formatter produces a member's report based on THEIR OWN
 * department. This is the single place the SEO/dev split is made, so the
 * dev-team path is guaranteed to behave exactly as before unless a member
 * belongs to the SEO department.
 *
 * Routing rules:
 *   • Submitting member's department name matches the SEO department
 *     (see SEO_REPORT_CONFIG.departmentNames)  ->  SEO format
 *   • Everything else (including no department, or an admin editing someone
 *     else's report)                         ->  dev-team format
 *
 * The target member's department is used (not the editor's) so a superadmin
 * editing an SEO member's submission still produces the SEO format.
 */

import { generateReport, type ReportInput } from "@/lib/report-formatter";
import {
  generateSeoReport,
  isSeoDepartment,
  type SeoReportInput,
} from "@/lib/seo-report-formatter";

/** The SEO-specific values a submission can carry. */
export interface SeoSubmissionFields {
  tasksDoneLinks?: string[] | null;
  inReviewLinks?: string[] | null;
  inProgressLinks?: string[] | null;
  overdueLinks?: string[] | null;
  tasksDone?: number | null;
  inReview?: number | null;
  inProgress?: number | null;
  overdueTasks?: number | null;
}

function splitLinks(value: string[] | null | undefined): string[] {
  if (!value || value.length === 0) return [];
  return value
    .flatMap((s) => String(s).split(/[\r\n]+/))
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Build the SEO formatter input from stored/submitted fields.
 * Counts fall back to link counts inside generateSeoReport.
 */
export function buildSeoInput(
  date: string,
  fields: SeoSubmissionFields
): SeoReportInput {
  const tasksDoneLinks = splitLinks(fields.tasksDoneLinks);
  const inReviewLinks = splitLinks(fields.inReviewLinks);
  const inProgressLinks = splitLinks(fields.inProgressLinks);
  const overdueLinks = splitLinks(fields.overdueLinks);

  return {
    date,
    tasksDone: fields.tasksDone ?? 0,
    tasksDoneLinks,
    inReview: fields.inReview ?? 0,
    inReviewLinks,
    inProgress: fields.inProgress ?? 0,
    inProgressLinks,
    overdue: fields.overdueTasks ?? 0,
    overdueLinks,
  };
}

/**
 * Resolve a section's effective count inside the SEO formatter, so callers can
 * persist the same numbers the report printed. Mirrors the fallback rule used
 * by generateSeoReport: an explicit count wins, otherwise count the links.
 */
function effectiveCount(count: number | null | undefined, links: string[]): number {
  if (typeof count === "number" && count > 0) return count;
  return links.length;
}

export interface RouteResult {
  report: string;
  format: "seo" | "dev";
  /**
   * Value to store in submissions.totalAssigned.
   * For dev this is exactly what the caller already passed (possibly null) so
   * existing rows keep the same value. For SEO it is the derived
   * done + in-review + in-progress total, matching the printed report.
   */
  totalAssigned: number | null;
}

/**
 * Produce the report for a member, choosing the formatter by department name.
 *
 * @param departmentName Name of the SUBMITTING member's department
 * @param devInput       Fully-built dev-team input (ignored for SEO members)
 * @param seoFields      SEO link/count fields (ignored for dev members)
 */
export function generateReportForDepartment(
  departmentName: string | null | undefined,
  date: string,
  devInput: ReportInput,
  seoFields: SeoSubmissionFields
): RouteResult {
  if (isSeoDepartment(departmentName)) {
    const seoInput = buildSeoInput(date, seoFields);
    return {
      format: "seo",
      report: generateSeoReport(seoInput),
      totalAssigned:
        effectiveCount(seoInput.tasksDone, seoInput.tasksDoneLinks) +
        effectiveCount(seoInput.inReview, seoInput.inReviewLinks ?? []) +
        effectiveCount(seoInput.inProgress, seoInput.inProgressLinks),
    };
  }
  return {
    format: "dev",
    report: generateReport(devInput),
    totalAssigned: devInput.totalAssigned ?? null,
  };
}
