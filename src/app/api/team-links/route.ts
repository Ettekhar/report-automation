import { NextResponse } from "next/server";
import { requireSession, getRequestDeps, withErrorHandling } from "@/lib/api-helpers";
import { requirePermission } from "@/lib/permissions";
import { teamTaskLinks } from "@/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "edge";

// GET /api/team-links — public to all authenticated users
export async function GET() {
  return withErrorHandling(async () => {
    await requireSession();
    const { db } = await getRequestDeps();
    const links = await db.query.teamTaskLinks.findMany({
      orderBy: (t, { asc }) => [asc(t.sortOrder)],
    });
    return NextResponse.json(links);
  });
}

interface PostTeamLinksBody {
  url?: string;
  urls?: string[];
}

// POST /api/team-links — admin only, body: { url } or { urls: string[] }
export async function POST(req: Request) {
  return withErrorHandling(async () => {
    const session = await requireSession();
    requirePermission(session.userRole, "manage:users"); // reuse admin gate

    const body = (await req.json()) as PostTeamLinksBody;
    const { db } = await getRequestDeps();

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
