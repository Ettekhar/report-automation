import { getSession, getRequestDeps } from "@/lib/api-helpers";
import { redirect } from "next/navigation";
import { can } from "@/lib/permissions";
import UserManager from "@/components/UserManager";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.userRole, "manage:users")) redirect("/member");

  const { db } = await getRequestDeps();

  const allUsers = await db.query.users.findMany({
    columns: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: (u, { asc }) => [asc(u.name)],
  });

  const allLinks = await db.query.teamTaskLinks.findMany({
    orderBy: (t, { asc }) => [asc(t.sortOrder)],
  });

  return (
    <div className="page-container fade-in">
      <div style={{ marginBottom: "1.75rem" }}>
        <h1 style={{ fontSize: "1.4rem", marginBottom: 4 }}>User & Team Link Settings</h1>
        <p style={{ color: "#64748b", fontSize: "0.875rem", margin: 0 }}>
          Manage user permissions, assign roles (Admin / Member / Reviewer), and maintain the team dev task list.
        </p>
      </div>

      <UserManager
        initialUsers={allUsers}
        initialLinks={allLinks}
        currentUserId={session.userId}
      />
    </div>
  );
}
