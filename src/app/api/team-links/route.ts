import { NextResponse } from "next/server";
import { requireSession, getRequestDeps, withErrorHandling } from "@/lib/api-helpers";
import { requirePermission } from "@/lib/permissions";
import { teamTaskLinks } from "@/db/schema";
import { eq, or, isNull } from "drizzle-orm";

// GET /api/team-links — return department-specific task links
export async function GET(req: Request) {
  return withErrorHandling(async () => {
    const session = await requireSession();
    const { db } = await getRequestDeps();
    const url = new URL(req.url);
    const deptParam = url.searchParams.get("departmentId");

    let whereCondition = undefined;

    if (session.userRole === "superadmin") {
      if (deptParam && deptParam !== "all") {
        whereCondition = deptParam === "global" ? isNull(teamTaskLinks.departmentId) : eq(teamTaskLinks.departmentId, deptParam);
      }
    } else {
      // Normal admin/member: their department's links or global links
      whereCondition = session.userDepartmentId
        ? or(eq(teamTaskLinks.departmentId, session.userDepartmentId), isNull(teamTaskLinks.departmentId))
        : isNull(teamTaskLinks.departmentId);
    }

    const links = await db.query.teamTaskLinks.findMany({
      where: whereCondition,
      orderBy: (t, { asc }) => [asc(t.sortOrder)],
    });
    return NextResponse.json(links);
  });
}

interface PostTeamLinksBody {
  url?: string;
  urls?: string[];
  departmentId?: string | null;
}

// POST /api/team-links — leader or superadmin adds links
export async function POST(req: Request) {
  return withErrorHandling(async () => {
    const session = await requireSession();
    requirePermission(session.userRole, "manage:users"); // reuse admin gate

    const body = (await req.json()) as PostTeamLinksBody;
    const { db } = await getRequestDeps();

    // Target department: leader adds to their department, superadmin can specify
    const targetDeptId = session.userRole === "superadmin"
      ? (body.departmentId ?? null)
      : (session.userDepartmentId ?? null);

    // Get current max sort_order
    const existing = await db.query.teamTaskLinks.findMany({
      orderBy: (t, { desc }) => [desc(t.sortOrder)],
      limit: 1,
    });
    let nextOrder = (existing[0]?.sortOrder ?? -1) + 1;

    const urlList: string[] = body.urls ?? (body.url ? [body.url] : []);
    const rows = urlList
      .map((u) => u.trim())
      .filter(Boolean)
      .map((url) => ({
        id: crypto.randomUUID(),
        url,
        sortOrder: nextOrder++,
        addedBy: session.userId,
        departmentId: targetDeptId,
      }));

    for (const row of rows) {
      await db.insert(teamTaskLinks).values(row).onConflictDoNothing();
    }

    return NextResponse.json({ created: rows.length }, { status: 201 });
  });
}

// DELETE /api/team-links?id=... — admin only
export async function DELETE(req: Request) {
  return withErrorHandling(async () => {
    const session = await requireSession();
    requirePermission(session.userRole, "manage:users");

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const { db } = await getRequestDeps();

    const link = await db.query.teamTaskLinks.findFirst({
      where: eq(teamTaskLinks.id, id),
    });

    if (!link) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    // Normal admin can only delete links of their department
    if (session.userRole !== "superadmin") {
      if (link.departmentId && link.departmentId !== session.userDepartmentId) {
        return NextResponse.json(
          { error: "You can only manage links for your own department" },
          { status: 403 }
        );
      }
    }

    await db.delete(teamTaskLinks).where(eq(teamTaskLinks.id, id));
    return NextResponse.json({ ok: true });
  });
}

interface PatchTeamLinksBody {
  order?: string[];
}

// PATCH /api/team-links — reorder links, body: { order: string[] } (array of ids)
export async function PATCH(req: Request) {
  return withErrorHandling(async () => {
    const session = await requireSession();
    requirePermission(session.userRole, "manage:users");

    const body = (await req.json()) as PatchTeamLinksBody;
    const { db } = await getRequestDeps();
    const order: string[] = body.order ?? [];

    for (let i = 0; i < order.length; i++) {
      await db
        .update(teamTaskLinks)
        .set({ sortOrder: i })
        .where(eq(teamTaskLinks.id, order[i]));
    }

    return NextResponse.json({ ok: true });
  });
}
