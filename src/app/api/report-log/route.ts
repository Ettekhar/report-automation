import { NextResponse } from "next/server";
import {
  requireSession,
  getRequestDeps,
  withErrorHandling,
} from "@/lib/api-helpers";
import { submissions, users } from "@/db/schema";
import { and, count, desc, eq, gte, inArray, isNull, like, lte } from "drizzle-orm";
import type { RequestSession } from "@/lib/api-helpers";

// ---------------------------------------------------------------------------
// GET /api/report-log
//
// A combined "question + answer" log over the daily report submissions.
// Each submission already stores BOTH sides in D1:
//   - what the team sent  → rawWhatsappText (paste) + rawInput (form JSON)  ["question"]
//   - what the app output → finalReport                                     ["answer"]
//
// This endpoint mixes them into one browsable record per date/user.
//
// Query params:
//   ?date=YYYY-MM-DD      exact report date (all users that day)
//   ?from=&to=            date range (YYYY-MM-DD, inclusive)
//   ?userId=              only that user's reports
//   ?departmentId=        superadmin only: dept id, "unassigned", or "all"
//   ?name=                search substrings of the reporter's name
//   ?group=date           group the results under each report date
//   ?limit=               page size (default 200, max 500)
//   ?offset=              page offset
//
// Access (mirrors GET /api/submissions):
//   - member    → only their own reports
//   - reviewer/admin → reports of their own department's users
//   - superadmin → all reports (optional departmentId filter)
//   - Service clients: if env REPORT_API_KEY is set, send
//     `Authorization: Bearer <REPORT_API_KEY>` to get superadmin scope
//     without a browser session (used by OfficeOS bridge / scripts).
// ---------------------------------------------------------------------------
export async function GET(req: Request) {
  return withErrorHandling(async () => {
    const url = new URL(req.url);
    const q = parseQuery(url);

    // Service-token access (machine clients, e.g. the OfficeOS bridge).
    const serviceToken = process.env.REPORT_API_KEY;
    const authHeader = req.headers.get("authorization") || "";
    const isService = Boolean(serviceToken) && authHeader === `Bearer ${serviceToken}`;

    const session: RequestSession | null = isService ? null : await requireSession();
    const { db } = await getRequestDeps();

    // Build the WHERE clauses.
    const conditions = [];
    if (q.date) conditions.push(eq(submissions.reportDate, q.date));
    if (q.from) conditions.push(gte(submissions.reportDate, q.from));
    if (q.to) conditions.push(lte(submissions.reportDate, q.to));
    if (q.userId) conditions.push(eq(submissions.userId, q.userId));

    if (!isService && session) {
      if (session.userRole === "member") {
        // Members only see their own report log.
        conditions.push(eq(submissions.userId, session.userId));
      } else if (session.userRole === "superadmin") {
        if (q.departmentId && q.departmentId !== "all") {
          const deptUsers = await db.query.users.findMany({
            where:
              q.departmentId === "unassigned"
                ? isNull(users.departmentId)
                : eq(users.departmentId, q.departmentId),
            columns: { id: true },
          });
          const userIds = deptUsers.map((u) => u.id);
          if (userIds.length === 0) return json({ items: [], meta: { total: 0, ...q } });
          conditions.push(inArray(submissions.userId, userIds));
        }
      } else {
        // Admin / reviewer: scoped to their own department's users.
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
        if (userIds.length === 0) return json({ items: [], meta: { total: 0, ...q } });
        conditions.push(inArray(submissions.userId, userIds));
      }
    }

    // Optional name search: restrict to users whose name contains the term.
    if (q.name) {
      const nameUsers = await db.query.users.findMany({
        where: like(users.name, `%${q.name}%`),
        columns: { id: true },
      });
      const userIds = nameUsers.map((u) => u.id);
      if (userIds.length === 0) return json({ items: [], meta: { total: 0, ...q } });
      conditions.push(inArray(submissions.userId, userIds));
    }

    const where = conditions.length ? and(...conditions) : undefined;

    // Total count (for pagination).
    const [totalRow] = await db.select({ n: count() }).from(submissions).where(where);
    const total = totalRow?.n ?? 0;

    const rows = await db.query.submissions.findMany({
      where,
      with: { user: { columns: { name: true, email: true, role: true } } },
      orderBy: [desc(submissions.reportDate), desc(submissions.createdAt)],
      limit: q.limit,
      offset: q.offset,
    });

    const isSuper = isService || session?.userRole === "superadmin";
    const items = rows.map((row) => {
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(row.rawInput);
      } catch {
        input = { raw: row.rawInput };
      }
      const u = row.user as { name: string; email: string; role?: string } | undefined;
      // Mask superadmin roles unless the viewer is superadmin/service.
      const role =
        !isSuper && u?.role === "superadmin" ? "admin" : (u?.role ?? "member");

      return {
        id: row.id,
        reportDate: row.reportDate,
        user: { id: row.userId, name: u?.name ?? "", email: u?.email ?? "", role },
        // ── The "question" side: what the team sent ─────────────────────
        question: {
          whatsapp: row.rawWhatsappText ?? null,
          input,
        },
        // ── The "answer" side: what the app generated ────────────────────
        answer: {
          finalReport: row.finalReport,
          counts: {
            totalAssigned: row.totalAssigned,
            tasksDone: row.tasksDone,
            tasksDoneLink: row.tasksDoneLink,
            inReview: row.inReview,
            inProgress: row.inProgress,
            overdueTasks: row.overdueTasks,
            overdueDependencies: row.overdueDependencies,
            overdueDepNote: row.overdueDepNote,
            tomorrowCount: row.tomorrowCount,
            maintenanceEnabled: input.maintenanceEnabled ?? false,
            maintenanceTotal: input.maintenanceTotal ?? null,
          },
        },
        edits: {
          editCount: row.editCount ?? 0,
          editedBy: row.editedBy,
          editedAt: row.editedAt ? new Date(row.editedAt).toISOString() : null,
        },
        createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
      };
    });

    const meta = {
      total,
      limit: q.limit,
      offset: q.offset,
      scope: isService ? "service" : (session?.userRole ?? "anonymous"),
    };

    if (q.group === "date") {
      const grouped: Record<string, typeof items> = {};
      for (const item of items) {
        (grouped[item.reportDate] ||= []).push(item);
      }
      return json({ grouped, meta });
    }

    return json({ items, meta });
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ReportLogQuery {
  date: string | null;
  from: string | null;
  to: string | null;
  userId: string | null;
  departmentId: string | null;
  name: string | null;
  limit: number;
  offset: number;
  group: "none" | "date";
}

function parseQuery(url: URL): ReportLogQuery {
  const rawLimit = parseInt(url.searchParams.get("limit") ?? "", 10);
  const rawOffset = parseInt(url.searchParams.get("offset") ?? "", 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 500) : 200;
  const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0;
  return {
    date: url.searchParams.get("date"),
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    userId: url.searchParams.get("userId"),
    departmentId: url.searchParams.get("departmentId"),
    name: url.searchParams.get("name")?.trim() || null,
    limit,
    offset,
    group: url.searchParams.get("group") === "date" ? "date" : "none",
  };
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}