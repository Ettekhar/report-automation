import { NextResponse } from "next/server";
import { requireSession, getRequestDeps, withErrorHandling } from "@/lib/api-helpers";
import { requirePermission } from "@/lib/permissions";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { Role } from "@/lib/permissions";

export const runtime = "edge";

// ---------------------------------------------------------------------------
// GET /api/users — list all users (admin/reviewer only)
// ---------------------------------------------------------------------------
export async function GET() {
  return withErrorHandling(async () => {
    const session = await requireSession();
    requirePermission(session.userRole, "view:all");
    const { db } = await getRequestDeps();

    const rows = await db.query.users.findMany({
      columns: { id: true, name: true, email: true, role: true, createdAt: true },
      orderBy: (u, { asc }) => [asc(u.name)],
    });

    return NextResponse.json(rows);
  });
}

interface PatchUserBody {
  userId: string;
  role: Role;
}

// ---------------------------------------------------------------------------
// PATCH /api/users — update a user's role (admin only)
// Body: { userId, role }
// ---------------------------------------------------------------------------
export async function PATCH(req: Request) {
  return withErrorHandling(async () => {
    const session = await requireSession();
    requirePermission(session.userRole, "manage:users");

    const body = (await req.json()) as PatchUserBody;
    const { db } = await getRequestDeps();

    // Prevent self-demotion
    if (body.userId === session.userId && body.role !== "admin") {
      return NextResponse.json(
        { error: "Cannot change your own role" },
        { status: 400 }
      );
    }

    await db
      .update(users)
      .set({ role: body.role, updatedAt: new Date() })
      .where(eq(users.id, body.userId));

    return NextResponse.json({ ok: true });
  });
}

// ---------------------------------------------------------------------------
// DELETE /api/users?userId=... — remove a user (admin only)
// ---------------------------------------------------------------------------
export async function DELETE(req: Request) {
  return withErrorHandling(async () => {
    const session = await requireSession();
    requirePermission(session.userRole, "manage:users");

    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }
    if (userId === session.userId) {
      return NextResponse.json(
        { error: "Cannot delete yourself" },
        { status: 400 }
      );
    }

    const { db } = await getRequestDeps();
    await db.delete(users).where(eq(users.id, userId));
    return NextResponse.json({ ok: true });
  });
}
