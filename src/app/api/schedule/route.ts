import { NextResponse } from "next/server";
import { requireSession, getRequestDeps, withErrorHandling } from "@/lib/api-helpers";
import { requirePermission } from "@/lib/permissions";
import { scheduleAssignments, users } from "@/db/schema";
import { eq, and, gte, lte, inArray, isNull } from "drizzle-orm";

// ---------------------------------------------------------------------------
// GET /api/schedule?from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns assignments within date range, scoped to user's department
// ---------------------------------------------------------------------------
export async function GET(req: Request) {
  return withErrorHandling(async () => {
    const session = await requireSession();
    const { db } = await getRequestDeps();
    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const userId = url.searchParams.get("userId");
    const deptParam = url.searchParams.get("departmentId");

    const conditions = [];
    if (from) conditions.push(gte(scheduleAssignments.assignedDate, from));
    if (to) conditions.push(lte(scheduleAssignments.assignedDate, to));
    if (userId) conditions.push(eq(scheduleAssignments.userId, userId));

    if (session.userRole === "superadmin") {
      if (deptParam && deptParam !== "all") {
        const deptUsers = await db.query.users.findMany({
          where: deptParam === "unassigned" ? isNull(users.departmentId) : eq(users.departmentId, deptParam),
          columns: { id: true },
        });
        const uids = deptUsers.map((u) => u.id);
        if (uids.length === 0) return NextResponse.json([]);
        conditions.push(inArray(scheduleAssignments.userId, uids));
      }
    } else {
      // Normal admin / member / reviewer: only see their department's assignments
      const deptUsers = session.userDepartmentId
        ? await db.query.users.findMany({
            where: eq(users.departmentId, session.userDepartmentId),
            columns: { id: true },
          })
        : await db.query.users.findMany({
            where: eq(users.id, session.userId),
            columns: { id: true },
          });

      const uids = deptUsers.map((u) => u.id);
      if (uids.length === 0) return NextResponse.json([]);
      conditions.push(inArray(scheduleAssignments.userId, uids));
    }

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
// POST /api/schedule — assign user(s) to date(s)
// Body: { userId, date } OR { assignments: [{ userId, date }], replace?: boolean }
// Scoped to leader's department
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

    // Normal admin can only assign users in their own department
    if (session.userRole !== "superadmin") {
      const targetUserIds = list.map((l) => l.userId);
      const targetUsers = await db.query.users.findMany({
        where: inArray(users.id, targetUserIds),
        columns: { id: true, departmentId: true },
      });
      const invalid = targetUsers.some((u) => u.departmentId !== session.userDepartmentId);
      if (invalid) {
        return NextResponse.json(
          { error: "You can only assign schedules to members of your own department" },
          { status: 403 }
        );
      }
    }

    const dates = [...new Set(list.map((l) => l.date))];

    // If replace is requested, remove existing assignments on these dates for allowed users
    if (body.replace && dates.length > 0) {
      if (session.userRole === "superadmin") {
        await db
          .delete(scheduleAssignments)
          .where(inArray(scheduleAssignments.assignedDate, dates));
      } else {
        const deptUsers = await db.query.users.findMany({
          where: eq(users.departmentId, session.userDepartmentId!),
          columns: { id: true },
        });
        const deptUserIds = deptUsers.map((u) => u.id);
        if (deptUserIds.length > 0) {
          await db
            .delete(scheduleAssignments)
            .where(
              and(
                inArray(scheduleAssignments.assignedDate, dates),
                inArray(scheduleAssignments.userId, deptUserIds)
              )
            );
        }
      }
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

    // Normal admin department check
    if (session.userRole !== "superadmin" && userId) {
      const target = await db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: { departmentId: true },
      });
      if (target?.departmentId !== session.userDepartmentId) {
        return NextResponse.json(
          { error: "You can only modify schedule for your own department" },
          { status: 403 }
        );
      }
    }

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
      if (session.userRole === "superadmin") {
        await db
          .delete(scheduleAssignments)
          .where(
            and(
              gte(scheduleAssignments.assignedDate, from),
              lte(scheduleAssignments.assignedDate, to)
            )
          );
      } else {
        const deptUsers = await db.query.users.findMany({
          where: eq(users.departmentId, session.userDepartmentId!),
          columns: { id: true },
        });
        const uids = deptUsers.map((u) => u.id);
        if (uids.length > 0) {
          await db
            .delete(scheduleAssignments)
            .where(
              and(
                gte(scheduleAssignments.assignedDate, from),
                lte(scheduleAssignments.assignedDate, to),
                inArray(scheduleAssignments.userId, uids)
              )
            );
        }
      }
      return NextResponse.json({ ok: true, clearedRange: { from, to } });
    }

    if (date) {
      if (session.userRole === "superadmin") {
        await db
          .delete(scheduleAssignments)
          .where(eq(scheduleAssignments.assignedDate, date));
      } else {
        const deptUsers = await db.query.users.findMany({
          where: eq(users.departmentId, session.userDepartmentId!),
          columns: { id: true },
        });
        const uids = deptUsers.map((u) => u.id);
        if (uids.length > 0) {
          await db
            .delete(scheduleAssignments)
            .where(
              and(
                eq(scheduleAssignments.assignedDate, date),
                inArray(scheduleAssignments.userId, uids)
              )
            );
        }
      }
      return NextResponse.json({ ok: true, clearedDate: date });
    }

    return NextResponse.json(
      { error: "Specify userId and date, or from and to range" },
      { status: 400 }
    );
  });
}
