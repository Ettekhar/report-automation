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
  resolveSeoSectionCount,
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
 *
 * Counts are passed through as-is: `null`/`undefined` means "no number was
 * written, count the links", while an explicit `0` is honoured. Callers must
 * therefore pass the RAW submitted value and not a `?? 0` default.
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
    tasksDone: fields.tasksDone ?? null,
    tasksDoneLinks,
    inReview: fields.inReview ?? null,
    inReviewLinks,
    inProgress: fields.inProgress ?? null,
    inProgressLinks,
    overdue: fields.overdueTasks ?? null,
    overdueLinks,
  };
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
  /**
   * Per-section counts to store in the denormalised submissions columns, so the
   * admin dashboard agrees with the report text.
   * For dev these are the caller's own values (unchanged behaviour); for SEO
   * they are the resolved counts, i.e. the numbers the report actually printed.
   */
  counts: {
    tasksDone: number;
    inReview: number;
    inProgress: number;
    overdue: number;
  };
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
      // Reuse the formatter's own resolver so the persisted numbers are
      // exactly what the report printed.
      totalAssigned:
        resolveSeoSectionCount(seoInput.tasksDone, seoInput.tasksDoneLinks) +
        resolveSeoSectionCount(seoInput.inReview, seoInput.inReviewLinks ?? []) +
        resolveSeoSectionCount(seoInput.inProgress, seoInput.inProgressLinks),
      counts: {
        tasksDone: resolveSeoSectionCount(seoInput.tasksDone, seoInput.tasksDoneLinks),
        inReview: resolveSeoSectionCount(seoInput.inReview, seoInput.inReviewLinks ?? []),
        inProgress: resolveSeoSectionCount(seoInput.inProgress, seoInput.inProgressLinks),
        overdue: resolveSeoSectionCount(seoInput.overdue, seoInput.overdueLinks),
      },
    };
  }
  return {
    format: "dev",
    report: generateReport(devInput),
    totalAssigned: devInput.totalAssigned ?? null,
    counts: {
      tasksDone: devInput.tasksDone,
      inReview: devInput.inReview,
      inProgress: devInput.inProgress,
      overdue: devInput.overdueTasks,
    },
  };
}
