import { getSession, getRequestDeps } from "@/lib/api-helpers";
import { redirect } from "next/navigation";
import { can } from "@/lib/permissions";
import DepartmentManager from "@/components/DepartmentManager";

export const dynamic = "force-dynamic";

export default async function AdminDepartmentsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.userRole, "view:departments")) redirect("/member");

  const { db } = await getRequestDeps();

  const depts = await db.query.departments.findMany({
    with: {
      users: {
        columns: { id: true, name: true, email: true, role: true },
      },
    },
    orderBy: (d, { asc }) => [asc(d.name)],
  });

  const formattedDepts = depts.map((d) => ({
    id: d.id,
    name: d.name,
    description: d.description,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    userCount: d.users.length,
    users: d.users,
  }));

  return (
    <div className="page-container fade-in">
      <div style={{ marginBottom: "1.75rem" }}>
        <h1 style={{ fontSize: "1.4rem", marginBottom: 4 }}>Department Management</h1>
        <p style={{ color: "#64748b", fontSize: "0.875rem", margin: 0 }}>
          Organize teams into departments, see department-wise people, and maintain organizational structure.
        </p>
      </div>

      <DepartmentManager
        initialDepartments={formattedDepts}
        currentUserRole={session.userRole}
      />
    </div>
  );
}
