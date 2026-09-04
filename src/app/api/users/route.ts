import { NextResponse } from "next/server";
import { requireSession, getRequestDeps, withErrorHandling } from "@/lib/api-helpers";
import { requirePermission } from "@/lib/permissions";
import { users, departments } from "@/db/schema";
import { eq, isNull } from "drizzle-orm";
import type { Role } from "@/lib/permissions";

// ---------------------------------------------------------------------------
// GET /api/users — list users (department-scoped for normal admin/reviewer)
// ---------------------------------------------------------------------------
export async function GET(req: Request) {
  return withErrorHandling(async () => {
    const session = await requireSession();
    requirePermission(session.userRole, "view:all");
    const { db } = await getRequestDeps();

    const url = new URL(req.url);
    const deptParam = url.searchParams.get("departmentId");

    let whereCondition = undefined;

    if (session.userRole === "superadmin") {
      if (deptParam && deptParam !== "all") {
        whereCondition = deptParam === "unassigned" ? isNull(users.departmentId) : eq(users.departmentId, deptParam);
      }
    } else {
      // Normal admin / reviewer: only see people in their own department
      if (session.userDepartmentId) {
        whereCondition = eq(users.departmentId, session.userDepartmentId);
      } else {
        whereCondition = isNull(users.departmentId);
      }
    }

    const rows = await db.query.users.findMany({
      where: whereCondition,
      columns: {
        id: true,
        name: true,
        email: true,
        role: true,
        departmentId: true,
        createdAt: true,
      },
      with: {
        department: {
          columns: { id: true, name: true },
        },
      },
      orderBy: (u, { asc }) => [asc(u.name)],
    });

    // Invisibility: mask superadmin as admin for anyone who is not superadmin
    const sanitizedRows = rows.map((u) => {
      if (session.userRole !== "superadmin" && u.role === "superadmin") {
        return { ...u, role: "admin" as Role };
      }
      return u;
    });

    return NextResponse.json(sanitizedRows);
  });
}

interface PatchUserBody {
  userId: string;
  role?: Role;
  departmentId?: string | null;
}

// ---------------------------------------------------------------------------
// PATCH /api/users — update a user's role or department
// Body: { userId, role?, departmentId? }
// ---------------------------------------------------------------------------
export async function PATCH(req: Request) {
  return withErrorHandling(async () => {
    const session = await requireSession();
    requirePermission(session.userRole, "manage:users");

    const body = (await req.json()) as PatchUserBody;
    const { db } = await getRequestDeps();

    if (!body.userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const targetUser = await db.query.users.findFirst({
      where: eq(users.id, body.userId),
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Normal admin can only manage users in their own department
    if (session.userRole !== "superadmin") {
      if (!session.userDepartmentId || targetUser.departmentId !== session.userDepartmentId) {
        return NextResponse.json(
          { error: "You can only manage users within your own department" },
          { status: 403 }
        );
      }
      // Normal admin cannot move users between departments
      if (body.departmentId !== undefined && body.departmentId !== targetUser.departmentId) {
        return NextResponse.json(
          { error: "Only superadmin can reassign user departments" },
          { status: 403 }
        );
      }
    }

    const updates: Partial<{
      role: Role;
      departmentId: string | null;
      updatedAt: Date;
    }> = {
      updatedAt: new Date(),
    };

    // Role changes
    if (body.role && body.role !== targetUser.role) {
      // Prevent self-demotion
      if (body.userId === session.userId) {
        return NextResponse.json(
          { error: "Cannot change your own role" },
          { status: 400 }
        );
      }

      // Only superadmin can modify an existing admin or superadmin
      if (
        (targetUser.role === "admin" || targetUser.role === "superadmin") &&
        session.userRole !== "superadmin"
      ) {
        return NextResponse.json(
          { error: "Only superadmin can modify an admin's role" },
          { status: 403 }
        );
      }

      // Only superadmin can assign admin or superadmin roles
      if (
        (body.role === "admin" || body.role === "superadmin") &&
        session.userRole !== "superadmin"
      ) {
        return NextResponse.json(
          { error: "Only superadmin can assign admin or superadmin roles" },
          { status: 403 }
        );
      }

      updates.role = body.role;
    }

    // Department changes (superadmin only)
    if (body.departmentId !== undefined && session.userRole === "superadmin") {
      if (body.departmentId) {
        const dept = await db.query.departments.findFirst({
          where: eq(departments.id, body.departmentId),
        });
        if (!dept) {
          return NextResponse.json(
            { error: "Department not found" },
            { status: 404 }
          );
        }
        updates.departmentId = body.departmentId;
      } else {
        updates.departmentId = null;
      }
    }

    await db
      .update(users)
      .set(updates)
      .where(eq(users.id, body.userId));

    return NextResponse.json({ ok: true });
  });
}

// ---------------------------------------------------------------------------
// DELETE /api/users?userId=... — remove a user
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

    const targetUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Normal admin can only remove users within their own department
    if (session.userRole !== "superadmin") {
      if (!session.userDepartmentId || targetUser.departmentId !== session.userDepartmentId) {
        return NextResponse.json(
          { error: "You can only remove users within your own department" },
          { status: 403 }
        );
      }
      if (targetUser.role === "admin" || targetUser.role === "superadmin") {
        return NextResponse.json(
          { error: "Only superadmin can delete an admin" },
          { status: 403 }
        );
      }
    }

    await db.delete(users).where(eq(users.id, userId));
    return NextResponse.json({ ok: true });
  });
}
