import { NextResponse } from "next/server";
import { requireSession, getRequestDeps, withErrorHandling } from "@/lib/api-helpers";
import { requirePermission } from "@/lib/permissions";
import { departments, users } from "@/db/schema";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// GET /api/departments — list all departments with user counts & members
// ---------------------------------------------------------------------------
export async function GET() {
  return withErrorHandling(async () => {
    const session = await requireSession();
    requirePermission(session.userRole, "view:departments");
    const { db } = await getRequestDeps();

    const depts = await db.query.departments.findMany({
      with: {
        users: {
          columns: { id: true, name: true, email: true, role: true },
        },
      },
      orderBy: (d, { asc }) => [asc(d.name)],
    });

    const result = depts.map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      userCount: d.users.length,
      users: d.users,
    }));

    return NextResponse.json(result);
  });
}

// ---------------------------------------------------------------------------
// POST /api/departments — create a department (superadmin only)
// Body: { name, description? }
// ---------------------------------------------------------------------------
export async function POST(req: Request) {
  return withErrorHandling(async () => {
    const session = await requireSession();
    requirePermission(session.userRole, "manage:departments");

    const body = (await req.json()) as { name?: string; description?: string };
    const name = body.name?.trim();

    if (!name) {
      return NextResponse.json({ error: "Department name is required" }, { status: 400 });
    }

    const { db } = await getRequestDeps();

    // Check unique name
    const existing = await db.query.departments.findFirst({
      where: eq(departments.name, name),
    });
    if (existing) {
      return NextResponse.json(
        { error: `Department '${name}' already exists` },
        { status: 409 }
      );
    }

    const newId = `dept_${crypto.randomUUID()}`;
    await db.insert(departments).values({
      id: newId,
      name,
      description: body.description?.trim() || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const created = await db.query.departments.findFirst({
      where: eq(departments.id, newId),
    });

    return NextResponse.json(created, { status: 201 });
  });
}

// ---------------------------------------------------------------------------
// PATCH /api/departments — update department details (superadmin only)
// Body: { id, name?, description? }
// ---------------------------------------------------------------------------
export async function PATCH(req: Request) {
  return withErrorHandling(async () => {
    const session = await requireSession();
    requirePermission(session.userRole, "manage:departments");

    const body = (await req.json()) as { id: string; name?: string; description?: string };
    if (!body.id) {
      return NextResponse.json({ error: "Department id is required" }, { status: 400 });
    }

    const { db } = await getRequestDeps();

    const existing = await db.query.departments.findFirst({
      where: eq(departments.id, body.id),
    });
    if (!existing) {
      return NextResponse.json({ error: "Department not found" }, { status: 404 });
    }

    const updates: Partial<{ name: string; description: string | null; updatedAt: Date }> = {
      updatedAt: new Date(),
    };

    if (body.name !== undefined) {
      const trimmed = body.name.trim();
      if (!trimmed) {
        return NextResponse.json({ error: "Department name cannot be empty" }, { status: 400 });
      }
      if (trimmed !== existing.name) {
        const duplicate = await db.query.departments.findFirst({
          where: eq(departments.name, trimmed),
        });
        if (duplicate) {
          return NextResponse.json({ error: `Department '${trimmed}' already exists` }, { status: 409 });
        }
      }
      updates.name = trimmed;
    }

    if (body.description !== undefined) {
      updates.description = body.description.trim() || null;
    }

    await db.update(departments).set(updates).where(eq(departments.id, body.id));

    return NextResponse.json({ ok: true });
  });
}

// ---------------------------------------------------------------------------
// DELETE /api/departments?id=... — delete department (superadmin only)
// ---------------------------------------------------------------------------
export async function DELETE(req: Request) {
  return withErrorHandling(async () => {
    const session = await requireSession();
    requirePermission(session.userRole, "manage:departments");

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const { db } = await getRequestDeps();

    // Nullify users in this department
    await db.update(users).set({ departmentId: null }).where(eq(users.departmentId, id));

    // Delete the department
    await db.delete(departments).where(eq(departments.id, id));

    return NextResponse.json({ ok: true });
  });
}
