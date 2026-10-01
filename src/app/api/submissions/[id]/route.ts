import { NextResponse } from "next/server";
import { requireSession, getRequestDeps, withErrorHandling } from "@/lib/api-helpers";
import { requirePermission, can } from "@/lib/permissions";
import { submissions, submissionEdits, teamTaskLinks, users, departments } from "@/db/schema";
import { eq, or, isNull } from "drizzle-orm";
import { deriveDependenciesCount, type ReportInput } from "@/lib/report-formatter";
import { generateReportForDepartment, type SeoSubmissionFields } from "@/lib/report-router";
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
  // ── SEO-department-only fields (ignored for dev-team members) ───────────
  inReviewLinks?: string[] | null;
  inProgressLinks?: string[] | null;
  overdueLinks?: string[] | null;
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

    // Fetch team links for regenerating the report — scope must match
    // GET /api/team-links: superadmin sees ALL links (global + every
    // department); other users see their own department's + global links.
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

    // Route by the SUBMISSION OWNER's department (not the editor's), so a
    // superadmin editing an SEO member's report still regenerates the SEO
    // format and dev-team reports are never switched to SEO by accident.
    let departmentName: string | null = null;
    if (row.userId) {
      const owner = await db.query.users.findFirst({
        where: eq(users.id, row.userId),
        columns: { departmentId: true },
      });
      if (owner?.departmentId) {
        const dept = await db.query.departments.findFirst({
          where: eq(departments.id, owner.departmentId),
          columns: { name: true },
        });
        departmentName = dept?.name ?? null;
      }
    }

    // Counts come from the RAW body / stored rawInput, not from input.*, so a
    // blank field stays "no number given" and the formatter counts the links.
    // An explicit 0 is preserved as an explicit 0.
    const storedNum = (key: string): number | null => {
      const v = storedRaw[key];
      return typeof v === "number" && Number.isFinite(v) ? v : null;
    };
    const bodyNum = (v: unknown): number | null =>
      typeof v === "number" && Number.isFinite(v) ? v : null;

    const seoFields: SeoSubmissionFields = {
      tasksDone: body.tasksDone !== undefined ? bodyNum(body.tasksDone) : storedNum("tasksDone"),
      tasksDoneLinks: input.tasksDoneLinks,
      inReview: body.inReview !== undefined ? bodyNum(body.inReview) : storedNum("inReview"),
      inReviewLinks:
        body.inReviewLinks !== undefined
          ? body.inReviewLinks
          : (storedRaw.inReviewLinks as string[] | undefined) ?? null,
      inProgress:
        body.inProgress !== undefined ? bodyNum(body.inProgress) : storedNum("inProgress"),
      inProgressLinks:
        body.inProgressLinks !== undefined
          ? body.inProgressLinks
          : (storedRaw.inProgressLinks as string[] | undefined) ?? null,
      overdueTasks:
        body.overdueTasks !== undefined ? bodyNum(body.overdueTasks) : storedNum("overdueTasks"),
      overdueLinks:
        body.overdueLinks !== undefined
          ? body.overdueLinks
          : (storedRaw.overdueLinks as string[] | undefined) ?? null,
    };

    const routed = generateReportForDepartment(
      departmentName,
      row.reportDate,
      input,
      seoFields
    );

    // A manually edited report body always wins — only regenerate when absent.
    const finalReport = body.finalReport ?? routed.report;

    // When the report is regenerated, store the derived dependencies count so
    // the DB column matches the report text. Manual text overrides keep the
    // typed/previous value (admin edited the text by hand).
    const storedDepCount = body.finalReport
      ? input.overdueDependencies
      : deriveDependenciesCount(input);

    await db
      .update(submissions)
      .set({
        ...input,
        // SEO reports derive the total from the link lists, so persist the
        // number that was actually printed. Dev members keep their own value.
        totalAssigned: routed.totalAssigned,
        overdueDependencies: storedDepCount,
        rawInput: JSON.stringify({ ...storedRaw, ...body }),
        finalReport,
        editedBy: session.userId,
        editedAt: new Date(),
        editCount: (row.editCount ?? 0) + 1,
      })
      .where(eq(submissions.id, id));

    return NextResponse.json({ id, finalReport, format: routed.format });
  });
}
