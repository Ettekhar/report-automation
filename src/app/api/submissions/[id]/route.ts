import { NextResponse } from "next/server";
import { requireSession, getRequestDeps, withErrorHandling } from "@/lib/api-helpers";
import { requirePermission, can } from "@/lib/permissions";
import { submissions, submissionEdits } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generateReport, type ReportInput } from "@/lib/report-formatter";
import { isWithinEditCutoff } from "@/lib/timezone";

// ---------------------------------------------------------------------------
// GET /api/submissions/[id]
// ---------------------------------------------------------------------------
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorHandling(async () => {
    const session = await requireSession();
    const { id } = await params;
    const { db } = await getRequestDeps();

    const row = await db.query.submissions.findFirst({
      where: eq(submissions.id, id),
      with: {
        user: { columns: { name: true, email: true, role: true } },
        edits: { orderBy: (e, { desc }) => [desc(e.editedAt)], limit: 20 },
      },
    });

    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Members can only view their own
    if (session.userRole === "member" && row.userId !== session.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(row);
  });
}

interface PatchSubmissionBody {
  changeNote?: string;
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
  finalReport?: string;
  /** Maintenance toggle — true when maintenance is running today */
  maintenanceEnabled?: boolean;
  /** Running total of maintenance completions today */
  maintenanceTotal?: number | null;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// PATCH /api/submissions/[id] — edit a submission
// ---------------------------------------------------------------------------
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorHandling(async () => {
    const session = await requireSession();
    const { id } = await params;
    const { db } = await getRequestDeps();

    const row = await db.query.submissions.findFirst({
      where: eq(submissions.id, id),
    });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const isOwner = row.userId === session.userId;

    // Permission check:
    // - Members can edit own submission only within cutoff
    // - Admins can edit any submission anytime
    if (!isOwner) {
      requirePermission(session.userRole, "edit:any");
    } else {
      requirePermission(session.userRole, "edit:own");
      if (!can(session.userRole, "edit:any")) {
        // Non-admin: enforce cutoff
        if (!isWithinEditCutoff(row.reportDate)) {
          return NextResponse.json(
            { error: "Edit window has closed for this submission" },
            { status: 403 }
          );
        }
      }
    }

    const body = (await req.json()) as PatchSubmissionBody;

    // Snapshot before overwriting (audit trail)
    await db.insert(submissionEdits).values({
      id: crypto.randomUUID(),
      submissionId: id,
      editedBy: session.userId,
      previousRawInput: row.rawInput,
      previousReport: row.finalReport,
      changeNote: body.changeNote ?? null,
    });

    // Fetch team links for regenerating the report
    const links = await db.query.teamTaskLinks.findMany({
      orderBy: (t, { asc }) => [asc(t.sortOrder)],
    });
    const teamLinks = links.map((l) => l.url);

    // Resolve maintenance values: prefer body values, fall back to stored rawInput
    let storedRaw: Record<string, unknown> = {};
    try { storedRaw = JSON.parse(row.rawInput); } catch { storedRaw = {}; }

    const input: ReportInput = {
      date: row.reportDate,
      totalAssigned: body.totalAssigned !== undefined ? body.totalAssigned : row.totalAssigned,
      tasksDone: body.tasksDone !== undefined ? body.tasksDone : row.tasksDone,
      tasksDoneLinks: body.tasksDoneLinks !== undefined
        ? body.tasksDoneLinks
        : (storedRaw.tasksDoneLinks as string[] | undefined) ?? null,
      tasksDoneLink: body.tasksDoneLink !== undefined ? body.tasksDoneLink : row.tasksDoneLink,
      inReview: body.inReview !== undefined ? body.inReview : row.inReview,
      inProgress: body.inProgress !== undefined ? body.inProgress : row.inProgress,
      overdueTasks: body.overdueTasks !== undefined ? body.overdueTasks : row.overdueTasks,
      overdueDependencies: body.overdueDependencies !== undefined ? body.overdueDependencies : row.overdueDependencies,
      overdueDepNote: body.overdueDepNote !== undefined ? body.overdueDepNote : row.overdueDepNote,
      tomorrowCount: body.tomorrowCount !== undefined ? body.tomorrowCount : row.tomorrowCount,
      teamTaskLinks: teamLinks,
      maintenanceEnabled: body.maintenanceEnabled !== undefined
        ? body.maintenanceEnabled
        : (storedRaw.maintenanceEnabled as boolean | undefined) ?? false,
      maintenanceTotal: body.maintenanceTotal !== undefined
        ? body.maintenanceTotal
        : (storedRaw.maintenanceTotal as number | undefined) ?? null,
    };

    const finalReport = body.finalReport ?? generateReport(input);

    await db
      .update(submissions)
      .set({
        ...input,
        rawInput: JSON.stringify({ ...storedRaw, ...body }),
        finalReport,
        editedBy: session.userId,
        editedAt: new Date(),
        editCount: (row.editCount ?? 0) + 1,
      })
      .where(eq(submissions.id, id));

    return NextResponse.json({ id, finalReport });
  });
}
