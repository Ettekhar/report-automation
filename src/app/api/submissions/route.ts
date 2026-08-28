import { NextResponse } from "next/server";
import { requireSession, getRequestDeps, withErrorHandling } from "@/lib/api-helpers";
import { requirePermission } from "@/lib/permissions";
import { submissions, teamTaskLinks } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { generateReport, type ReportInput } from "@/lib/report-formatter";



// ---------------------------------------------------------------------------
// GET /api/submissions — list submissions
// - member: only their own
// - reviewer/admin: all (optionally filter by ?date=YYYY-MM-DD or ?userId=...)
// ---------------------------------------------------------------------------
export async function GET(req: Request) {
  return withErrorHandling(async () => {
    const session = await requireSession();
    const { db } = await getRequestDeps();
    const url = new URL(req.url);
    const dateFilter = url.searchParams.get("date");
    const userFilter = url.searchParams.get("userId");

    let rows;

    if (session.userRole === "member") {
      // Members see only their own
      const conditions = [eq(submissions.userId, session.userId)];
      if (dateFilter) conditions.push(eq(submissions.reportDate, dateFilter));

      rows = await db.query.submissions.findMany({
        where: and(...conditions),
        with: { user: { columns: { name: true, email: true } } },
        orderBy: [desc(submissions.createdAt)],
        limit: 50,
      });
    } else {
      // Reviewer / admin can see all
      requirePermission(session.userRole, "view:all");
      const conditions = [];
      if (dateFilter) conditions.push(eq(submissions.reportDate, dateFilter));
      if (userFilter) conditions.push(eq(submissions.userId, userFilter));

      rows = await db.query.submissions.findMany({
        where: conditions.length ? and(...conditions) : undefined,
        with: { user: { columns: { name: true, email: true } } },
        orderBy: [desc(submissions.createdAt)],
        limit: 200,
      });
    }

    return NextResponse.json(rows);
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

    // Fetch team task links for report generation
    const links = await db.query.teamTaskLinks.findMany({
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
