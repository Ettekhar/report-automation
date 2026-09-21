import { NextResponse } from "next/server";
import { requireSession, getRequestDeps, withErrorHandling } from "@/lib/api-helpers";
import { requirePermission } from "@/lib/permissions";
import { fetchClickUpOverdueTasks } from "@/lib/clickup";
import { teamTaskLinks } from "@/db/schema";
import { eq, or, isNull } from "drizzle-orm";

// GET /api/clickup/overdue?name=sezan — fetch overdue tasks for a member from ClickUp
export async function GET(req: Request) {
  return withErrorHandling(async () => {
    await requireSession();

    const url = new URL(req.url);
    const queryName = url.searchParams.get("name") || "sezan";

    const result = await fetchClickUpOverdueTasks(queryName);
    return NextResponse.json(result);
  });
}

// POST /api/clickup/overdue — fetch from ClickUp and dynamically add links to Team Dev Task Links
export async function POST(req: Request) {
  return withErrorHandling(async () => {
    const session = await requireSession();
    requirePermission(session.userRole, "manage:users");

    const body = (await req.json()) as {
      name?: string;
      departmentId?: string | null;
      replaceExisting?: boolean;
    };

    const queryName = body.name || "sezan";
    const { db } = await getRequestDeps();

    const targetDeptId =
      session.userRole === "superadmin"
        ? (body.departmentId ?? null)
        : (session.userDepartmentId ?? null);

    // 1. Fetch overdue tasks from ClickUp
    const { member, tasks, urls } = await fetchClickUpOverdueTasks(queryName);

    if (urls.length === 0) {
      return NextResponse.json({
        created: 0,
        skipped: 0,
        member,
        tasks: [],
        message: `No overdue tasks found for ${member.username}`,
      });
    }

    // 2. Fetch existing links for this scope to avoid duplicates
    const whereCondition = targetDeptId
      ? eq(teamTaskLinks.departmentId, targetDeptId)
      : isNull(teamTaskLinks.departmentId);

    if (body.replaceExisting) {
      await db.delete(teamTaskLinks).where(whereCondition);
    }

    const existingLinks = await db.query.teamTaskLinks.findMany({
      where: whereCondition,
    });

    // Normalize URLs to compare (matching task IDs)
    const existingUrlSet = new Set(
      existingLinks.map((l) => l.url.trim().toLowerCase())
    );

    // Get current max sort_order
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

      // Check if already in DB under either format
      const alreadyExists =
        existingUrlSet.has(formattedUrl.toLowerCase()) ||
        existingUrlSet.has(rawUrl.toLowerCase()) ||
        existingLinks.some((l) => l.url.includes(task.id));

      if (alreadyExists) {
        skippedCount++;
        continue;
      }

      await db.insert(teamTaskLinks).values({
        id: crypto.randomUUID(),
        url: formattedUrl,
        sortOrder: nextOrder++,
        addedBy: session.userId,
        departmentId: targetDeptId,
      });

      existingUrlSet.add(formattedUrl.toLowerCase());
      createdCount++;
    }

    return NextResponse.json({
      success: true,
      created: createdCount,
      skipped: skippedCount,
      totalFound: tasks.length,
      member,
      tasks,
    });
  });
}
