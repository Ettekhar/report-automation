import { NextResponse } from "next/server";
import { requireSession, getRequestDeps, withErrorHandling } from "@/lib/api-helpers";
import { requirePermission } from "@/lib/permissions";
import { submissions, teamTaskLinks, users } from "@/db/schema";
import { eq, desc, and, or, isNull, inArray } from "drizzle-orm";
import { generateReport, type ReportInput } from "@/lib/report-formatter";
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
  [key: string]: unknown;
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

    // Fetch department task links (or global links) for report generation
    const linkConditions = session.userDepartmentId
      ? or(eq(teamTaskLinks.departmentId, session.userDepartmentId), isNull(teamTaskLinks.departmentId))
      : isNull(teamTaskLinks.departmentId);

    const links = await db.query.teamTaskLinks.findMany({
      where: linkConditions,
      orderBy: (t, { asc }) => [asc(t.sortOrder)],
    });
    const teamLinks = links.map((l) => l.url);

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

    const finalReport = generateReport(input);
    const id = crypto.randomUUID();

    await db.insert(submissions).values({
      id,
      userId: session.userId,
      reportDate: body.date,
      rawWhatsappText: body.rawWhatsappText ?? null,
      rawInput: JSON.stringify(body),
      totalAssigned: input.totalAssigned,
      tasksDone: input.tasksDone,
      tasksDoneLink: input.tasksDoneLink,
      inReview: input.inReview,
      inProgress: input.inProgress,
      overdueTasks: input.overdueTasks,
      overdueDependencies: input.overdueDependencies,
      overdueDepNote: input.overdueDepNote,
      tomorrowCount: input.tomorrowCount,
      finalReport,
    });

    return NextResponse.json({ id, finalReport }, { status: 201 });
  });
}
