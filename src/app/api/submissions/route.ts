import { NextResponse } from "next/server";
import { requireSession, getRequestDeps, withErrorHandling } from "@/lib/api-helpers";
import { requirePermission } from "@/lib/permissions";
import { submissions, teamTaskLinks, users, departments } from "@/db/schema";
import { eq, desc, and, or, isNull, inArray } from "drizzle-orm";
import { deriveDependenciesCount, type ReportInput } from "@/lib/report-formatter";
import { generateReportForDepartment, type SeoSubmissionFields } from "@/lib/report-router";
import type { Role } from "@/lib/permissions";

// ---------------------------------------------------------------------------
// GET /api/submissions — list submissions
// - member: only their own
// - reviewer/admin: only their department's members
// - superadmin: all (optionally filter by ?departmentId=...)
// ---------------------------------------------------------------------------
export async function GET(req: Request) {
  return withErrorHandling(async () => {
    const session = await requireSession();
    const { db } = await getRequestDeps();
    const url = new URL(req.url);
    const dateFilter = url.searchParams.get("date");
    const userFilter = url.searchParams.get("userId");
    const deptFilter = url.searchParams.get("departmentId");

    let rows;

    if (session.userRole === "member") {
      // Members see only their own
      const conditions = [eq(submissions.userId, session.userId)];
      if (dateFilter) conditions.push(eq(submissions.reportDate, dateFilter));

      rows = await db.query.submissions.findMany({
        where: and(...conditions),
        with: { user: { columns: { name: true, email: true, role: true } } },
        orderBy: [desc(submissions.createdAt)],
        limit: 50,
      });
    } else {
      requirePermission(session.userRole, "view:all");
      const conditions = [];
      if (dateFilter) conditions.push(eq(submissions.reportDate, dateFilter));
      if (userFilter) conditions.push(eq(submissions.userId, userFilter));

      if (session.userRole === "superadmin") {
        // Superadmin: can view all or filter by department
        if (deptFilter && deptFilter !== "all") {
          const deptUsers = await db.query.users.findMany({
            where: deptFilter === "unassigned" ? isNull(users.departmentId) : eq(users.departmentId, deptFilter),
            columns: { id: true },
          });
          const userIds = deptUsers.map((u) => u.id);
          if (userIds.length === 0) return NextResponse.json([]);
          conditions.push(inArray(submissions.userId, userIds));
        }
      } else {
        // Normal admin (department leader) & reviewer: only see their department's submissions
        const deptUsers = session.userDepartmentId
          ? await db.query.users.findMany({
              where: eq(users.departmentId, session.userDepartmentId),
              columns: { id: true },
            })
          : await db.query.users.findMany({
              where: eq(users.id, session.userId),
              columns: { id: true },
            });

        const userIds = deptUsers.map((u) => u.id);
        if (userIds.length === 0) return NextResponse.json([]);
        conditions.push(inArray(submissions.userId, userIds));
      }

      rows = await db.query.submissions.findMany({
        where: conditions.length ? and(...conditions) : undefined,
        with: { user: { columns: { name: true, email: true, role: true } } },
        orderBy: [desc(submissions.createdAt)],
        limit: 200,
      });
    }

    // Mask superadmin role if requester is not superadmin
    const sanitizedRows = rows.map((s) => {
      if (session.userRole !== "superadmin" && s.user && (s.user as { role?: string }).role === "superadmin") {
        return {
          ...s,
          user: {
            ...s.user,
            role: "admin" as Role,
          },
        };
      }
      return s;
    });

    return NextResponse.json(sanitizedRows);
  });
}

interface PostSubmissionBody {
  date: string;
  totalAssigned?: number | null;
  tasksDone?: number;
  /** New: array of completed-task URLs */
  tasksDoneLinks?: string[] | null;
  /** Legacy single-link field — kept for backward compat */
  tasksDoneLink?: string | null;
  inReview?: number;
  inProgress?: number;
  overdueTasks?: number;
  overdueDependencies?: number;
  overdueDepNote?: string | null;
  tomorrowCount?: number | null;
  rawWhatsappText?: string | null;
  /** Maintenance toggle — true when maintenance is running today */
  maintenanceEnabled?: boolean;
  /** Running total of maintenance completions today */
  maintenanceTotal?: number | null;
  // ── SEO-department-only fields (ignored for dev-team members) ───────────
  /** Links listed under the "in review" section */
  inReviewLinks?: string[] | null;
  /** Links listed under the "in progress" section */
  inProgressLinks?: string[] | null;
  /** Links listed under the "overdue" section */
  overdueLinks?: string[] | null;
  [key: string]: unknown;
}

/** Split the legacy single-string done-link into an array. */
function splitLegacyLinks(legacy: string | null | undefined): string[] | null {
  if (!legacy) return null;
  const arr = legacy.split(/[\r\n]+/).map((s) => s.trim()).filter(Boolean);
  return arr.length > 0 ? arr : null;
}

/**
 * Resolve the submitting member's department NAME.
 * Returns null when the user has no department assigned.
 */
async function getDepartmentName(
  db: Awaited<ReturnType<typeof getRequestDeps>>["db"],
  departmentId: string | null | undefined
): Promise<string | null> {
  if (!departmentId) return null;
  const row = await db.query.departments.findFirst({
    where: eq(departments.id, departmentId),
    columns: { name: true },
  });
  return row?.name ?? null;
}

// ---------------------------------------------------------------------------
// POST /api/submissions — create a new submission
// ---------------------------------------------------------------------------
export async function POST(req: Request) {
  return withErrorHandling(async () => {
    const session = await requireSession();
    requirePermission(session.userRole, "submit:own");

    const body = (await req.json()) as PostSubmissionBody;
    const { db } = await getRequestDeps();

    // Fetch team links for report generation — scope must match GET /api/team-links:
    // superadmin sees ALL links (global + every department); other users see
    // their own department's links plus global links.
    const linkConditions = session.userRole === "superadmin"
      ? undefined
      : session.userDepartmentId
        ? or(eq(teamTaskLinks.departmentId, session.userDepartmentId), isNull(teamTaskLinks.departmentId))
        : isNull(teamTaskLinks.departmentId);

    const links = await db.query.teamTaskLinks.findMany({
      where: linkConditions,
      orderBy: (t, { asc }) => [asc(t.sortOrder)],
    });
    const teamLinks = links.map((l) => ({ url: l.url, name: l.name ?? null }));

    const input: ReportInput = {
      date: body.date,
      totalAssigned: body.totalAssigned ?? null,
      tasksDone: body.tasksDone ?? 0,
      tasksDoneLinks: body.tasksDoneLinks ?? null,
      tasksDoneLink: body.tasksDoneLink ?? null, // legacy fallback
      inReview: body.inReview ?? 0,
      inProgress: body.inProgress ?? 0,
      overdueTasks: body.overdueTasks ?? 0,
      overdueDependencies: body.overdueDependencies ?? 0,
      overdueDepNote: body.overdueDepNote ?? null,
      tomorrowCount: body.tomorrowCount ?? null,
      teamTaskLinks: teamLinks,
      maintenanceEnabled: body.maintenanceEnabled ?? false,
      maintenanceTotal: body.maintenanceTotal ?? null,
    };

    // Route by the SUBMITTING member's own department: SEO members get the SEO
    // format, everyone else (including users with no department) keeps the
    // dev-team format exactly as before.
    const departmentName = await getDepartmentName(db, session.userDepartmentId);
    // NOTE: pass the RAW body counts (not input.*), because a missing count
    // must stay "no number given" so the formatter falls back to counting the
    // links. `input.tasksDone` is `body.tasksDone ?? 0`, which would turn a
    // blank field into an explicit 0 and suppress the link count.
    const seoFields: SeoSubmissionFields = {
      tasksDone: body.tasksDone ?? null,
      tasksDoneLinks: input.tasksDoneLinks ?? splitLegacyLinks(input.tasksDoneLink),
      inReview: body.inReview ?? null,
      inReviewLinks: body.inReviewLinks ?? null,
      inProgress: body.inProgress ?? null,
      inProgressLinks: body.inProgressLinks ?? null,
      overdueTasks: body.overdueTasks ?? null,
      overdueLinks: body.overdueLinks ?? null,
    };
    const { report: finalReport, format, totalAssigned } = generateReportForDepartment(
      departmentName,
      body.date,
      input,
      seoFields
    );
    const id = crypto.randomUUID();

    await db.insert(submissions).values({
      id,
      userId: session.userId,
      reportDate: body.date,
      rawWhatsappText: body.rawWhatsappText ?? null,
      rawInput: JSON.stringify(body),
      totalAssigned,
      tasksDone: input.tasksDone,
      tasksDoneLink: input.tasksDoneLink,
      inReview: input.inReview,
      inProgress: input.inProgress,
      overdueTasks: input.overdueTasks,
      // Store the derived count so the DB column always matches the report text
      overdueDependencies: deriveDependenciesCount(input),
      overdueDepNote: input.overdueDepNote,
      tomorrowCount: input.tomorrowCount,
      finalReport,
    });

    return NextResponse.json({ id, finalReport, format }, { status: 201 });
  });
}
