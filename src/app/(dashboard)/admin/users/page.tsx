import { getSession, getRequestDeps } from "@/lib/api-helpers";
import { redirect } from "next/navigation";
import { can } from "@/lib/permissions";
import UserManager from "@/components/UserManager";
import { users, departments, teamTaskLinks } from "@/db/schema";
import { eq, isNull, or } from "drizzle-orm";
import type { Role } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.userRole, "manage:users")) redirect("/member");

  const { db } = await getRequestDeps();
  const isSuper = session.userRole === "superadmin";

  // Filter users by department if not superadmin
  const userCondition = isSuper
    ? undefined
    : session.userDepartmentId
    ? eq(users.departmentId, session.userDepartmentId)
    : isNull(users.departmentId);

  const rawUsers = await db.query.users.findMany({
    where: userCondition,
    columns: { id: true, name: true, email: true, role: true, departmentId: true, createdAt: true },
    with: { department: { columns: { id: true, name: true } } },
    orderBy: (u, { asc }) => [asc(u.name)],
  });

  // Mask superadmin as admin if viewer is not superadmin
  const allUsers = rawUsers.map((u) => {
    if (!isSuper && u.role === "superadmin") {
      return { ...u, role: "admin" as Role };
    }
    return u;
  });

  // Departments list: all for superadmin, only current user's department for normal admin
  const allDepts = isSuper
    ? await db.query.departments.findMany({
        orderBy: (d, { asc }) => [asc(d.name)],
      })
    : session.userDepartmentId
    ? await db.query.departments.findMany({
        where: eq(departments.id, session.userDepartmentId),
        orderBy: (d, { asc }) => [asc(d.name)],
      })
    : [];

  // Team links: all for superadmin, department + global for normal admin
  const linkCondition = isSuper
    ? undefined
    : session.userDepartmentId
    ? or(eq(teamTaskLinks.departmentId, session.userDepartmentId), isNull(teamTaskLinks.departmentId))
    : isNull(teamTaskLinks.departmentId);

  const allLinks = await db.query.teamTaskLinks.findMany({
    where: linkCondition,
    orderBy: (t, { asc }) => [asc(t.sortOrder)],
  });

  const currentDeptName = !isSuper && session.userDepartmentId
    ? (allDepts[0]?.name ?? "Your Department")
    : null;

  return (
    <div className="page-container fade-in">
      <div style={{ marginBottom: "1.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <h1 style={{ fontSize: "1.4rem", margin: 0 }}>
            {isSuper ? "User & Team Management" : "Department Team & Task Management"}
          </h1>
          {currentDeptName && (
            <span className="badge badge-info" style={{ fontSize: "0.8rem" }}>
              🏢 {currentDeptName}
            </span>
          )}
        </div>
        <p style={{ color: "#64748b", fontSize: "0.875rem", margin: 0 }}>
          {isSuper
            ? "Manage user permissions, assign roles, organize team members across departments, and maintain dev task links."
            : `Manage team members, assign member/reviewer ranks, and set up development task links for ${currentDeptName || "your department"}.`}
        </p>
      </div>

      <UserManager
        initialUsers={allUsers}
        initialLinks={allLinks}
        departments={allDepts}
        currentUserId={session.userId}
        currentUserRole={session.userRole}
      />
    </div>
  );
}
