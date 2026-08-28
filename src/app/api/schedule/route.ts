import { NextResponse } from "next/server";
import { requireSession, getRequestDeps, withErrorHandling } from "@/lib/api-helpers";
import { requirePermission } from "@/lib/permissions";
import { scheduleAssignments } from "@/db/schema";
import { eq, and, gte, lte, inArray } from "drizzle-orm";



// ---------------------------------------------------------------------------
// GET /api/schedule?from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns assignments within date range. Open to all authenticated users.
// ---------------------------------------------------------------------------
export async function GET(req: Request) {
  return withErrorHandling(async () => {
    await requireSession();
    const { db } = await getRequestDeps();
    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const userId = url.searchParams.get("userId");

    const conditions = [];
    if (from) conditions.push(gte(scheduleAssignments.assignedDate, from));
    if (to) conditions.push(lte(scheduleAssignments.assignedDate, to));
    if (userId) conditions.push(eq(scheduleAssignments.userId, userId));

    const rows = await db.query.scheduleAssignments.findMany({
      where: conditions.length ? and(...conditions) : undefined,
      with: {
        user: { columns: { id: true, name: true, email: true } },
        assignedByUser: { columns: { name: true } },
      },
      orderBy: (t, { asc }) => [asc(t.assignedDate)],
    });

    return NextResponse.json(rows);
  });
}

interface ScheduleBody {
  userId?: string;
  date?: string;
  assignments?: { userId: string; date: string }[];
  replace?: boolean; // if true, clears any existing assignments on those dates before inserting
}

// ---------------------------------------------------------------------------
// POST /api/schedule — assign user(s) to date(s) (supports single or date ranges)
// Body: { userId, date } OR { assignments: [{ userId, date }], replace?: boolean }
// Admin only
// ---------------------------------------------------------------------------
export async function POST(req: Request) {
  return withErrorHandling(async () => {
    const session = await requireSession();
    requirePermission(session.userRole, "manage:schedule");

    const body = (await req.json()) as ScheduleBody;
    const { db } = await getRequestDeps();

    const list: { userId: string; date: string }[] =
      body.assignments ?? (body.userId && body.date ? [{ userId: body.userId, date: body.date }] : []);

    if (list.length === 0) {
      return NextResponse.json({ error: "Invalid schedule assignment payload" }, { status: 400 });
    }

    const dates = [...new Set(list.map((l) => l.date))];

    // If replace is requested, remove existing assignments on these dates first
    if (body.replace && dates.length > 0) {
      await db
        .delete(scheduleAssignments)
        .where(inArray(scheduleAssignments.assignedDate, dates));
    }

    const rows = list.map((a) => ({
      id: crypto.randomUUID(),
      userId: a.userId,
      assignedDate: a.date,
      assignedBy: session.userId,
    }));

    for (const row of rows) {
      await db
        .insert(scheduleAssignments)
        .values(row)
        .onConflictDoNothing();
    }

    return NextResponse.json({ created: rows.length, dates }, { status: 201 });
  });
}

// ---------------------------------------------------------------------------
// DELETE /api/schedule
// Supports:
// - ?userId=...&date=YYYY-MM-DD (remove specific user from specific date)
// - ?from=YYYY-MM-DD&to=YYYY-MM-DD (clear all assignments in date range)
// - ?date=YYYY-MM-DD (clear all assignments on a date)
// Admin only
// ---------------------------------------------------------------------------
export async function DELETE(req: Request) {
  return withErrorHandling(async () => {
    const session = await requireSession();
    requirePermission(session.userRole, "manage:schedule");

    const { db } = await getRequestDeps();
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");
    const date = url.searchParams.get("date");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    if (userId && date) {
      await db
        .delete(scheduleAssignments)
        .where(
          and(
            eq(scheduleAssignments.userId, userId),
            eq(scheduleAssignments.assignedDate, date)
          )
        );
      return NextResponse.json({ ok: true });
    }

    if (from && to) {
      await db
        .delete(scheduleAssignments)
        .where(
          and(
            gte(scheduleAssignments.assignedDate, from),
            lte(scheduleAssignments.assignedDate, to)
          )
        );
      return NextResponse.json({ ok: true, clearedRange: { from, to } });
    }

    if (date) {
      await db
        .delete(scheduleAssignments)
        .where(eq(scheduleAssignments.assignedDate, date));
      return NextResponse.json({ ok: true, clearedDate: date });
    }

    return NextResponse.json(
      { error: "Specify userId and date, or from and to range" },
      { status: 400 }
    );
  });
}
