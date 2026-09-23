import { NextResponse } from "next/server";
import { requireSession, getRequestDeps, withErrorHandling } from "@/lib/api-helpers";
import { requirePermission } from "@/lib/permissions";
import { fetchClickUpOverdueTasksForMultiple } from "@/lib/clickup";
import { teamTaskLinks } from "@/db/schema";
import { eq, isNull } from "drizzle-orm";

// GET /api/clickup/overdue?names=sezan,medul,taion — preview overdue tasks for one or more members
export async function GET(req: Request) {
  return withErrorHandling(async () => {
    await requireSession();

    const url = new URL(req.url);
    // Accept ?names=sezan,medul,taion  or  ?name=sezan (backwards-compat)
    const rawNames = url.searchParams.get("names") || url.searchParams.get("name") || "sezan";

    const result = await fetchClickUpOverdueTasksForMultiple(rawNames);
    return NextResponse.json(result);
  });
}

// POST /api/clickup/overdue — fetch from ClickUp and add links to Team Dev Task Links
export async function POST(req: Request) {
  return withErrorHandling(async () => {
    const session = await requireSession();
    requirePermission(session.userRole, "manage:users");

    const body = (await req.json()) as {
      names?: string;   // comma-separated: "sezan,medul,taion"
      name?: string;    // backwards-compat single name
      departmentId?: string | null;
      replaceExisting?: boolean;
    };

    const rawNames = body.names || body.name || "sezan";
    const { db } = await getRequestDeps();

    const targetDeptId =
      session.userRole === "superadmin"
        ? (body.departmentId ?? null)
        : (session.userDepartmentId ?? null);

    // 1. Fetch overdue tasks for all named members (deduped by task ID)
    const { members, tasks, urls, totalCount, notFound } =
      await fetchClickUpOverdueTasksForMultiple(rawNames);

    if (totalCount === 0) {
      return NextResponse.json({
        created: 0,
        skipped: 0,
        members,
        tasks: [],
        notFound,
        message: `No overdue tasks found for: ${rawNames}`,
      });
    }

    // 2. Optionally clear existing links in the target scope first
    const whereCondition = targetDeptId
      ? eq(teamTaskLinks.departmentId, targetDeptId)
      : isNull(teamTaskLinks.departmentId);

    if (body.replaceExisting) {
      await db.delete(teamTaskLinks).where(whereCondition);
    }

    // 3. Load ALL existing links for dedup — team_task_links.url is globally
    //    UNIQUE, so a URL owned by another scope would otherwise violate the
    //    constraint on insert. Dedup across every scope to avoid 500s.
    const existingLinks = await db.query.teamTaskLinks.findMany();

    const existingUrlSet = new Set(
      existingLinks.map((l) => l.url.trim().toLowerCase())
    );

    const existingOrders = await db.query.teamTaskLinks.findMany({
      orderBy: (t, { desc }) => [desc(t.sortOrder)],
      limit: 1,
    });
    let nextOrder = (existingOrders[0]?.sortOrder ?? -1) + 1;

    let createdCount = 0;
    let skippedCount = 0;

    for (const task of tasks) {
      const formattedUrl = task.formattedUrl.trim();
      const rawUrl = task.url.trim();

      // Deduplicate: check by full URL or task ID fragment
      const alreadyExists =
        existingUrlSet.has(formattedUrl.toLowerCase()) ||
        existingUrlSet.has(rawUrl.toLowerCase()) ||
        existingLinks.some((l) => l.url.includes(task.id));

      if (alreadyExists) {
        skippedCount++;
        continue;
      }

      await db
        .insert(teamTaskLinks)
        .values({
          id: crypto.randomUUID(),
          url: formattedUrl,
          name: task.name ?? null,
          sortOrder: nextOrder++,
          addedBy: session.userId,
          departmentId: targetDeptId,
        })
        .onConflictDoNothing();

      existingUrlSet.add(formattedUrl.toLowerCase());
      createdCount++;
    }

    return NextResponse.json({
      success: true,
      created: createdCount,
      skipped: skippedCount,
      totalFound: totalCount,
      members,
      tasks,
      notFound,
    });
  });
}
