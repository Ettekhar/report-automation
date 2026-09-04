import { getSession, getRequestDeps } from "@/lib/api-helpers";
import { redirect } from "next/navigation";
import { can } from "@/lib/permissions";
import { submissions, users, departments } from "@/db/schema";
import { desc, eq, inArray, isNull } from "drizzle-orm";
import { todayInTeamTZ } from "@/lib/timezone";
import AdminSubmissionCard from "@/components/AdminSubmissionCard";
import type { Role } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function ReviewerPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.userRole, "view:all")) redirect("/member");

  const { db } = await getRequestDeps();
  const today = todayInTeamTZ();

  const isSuperadmin = session.userRole === "superadmin";

  let deptName: string | null = null;
  if (session.userDepartmentId) {
    const dept = await db.query.departments.findFirst({
      where: eq(departments.id, session.userDepartmentId),
    });
    deptName = dept?.name ?? null;
  }

  // Load department member userIds if not superadmin
  let allowedUserIds: string[] | null = null;
  if (!isSuperadmin) {
    const deptUsers = session.userDepartmentId
      ? await db.query.users.findMany({
          where: eq(users.departmentId, session.userDepartmentId),
          columns: { id: true },
        })
      : await db.query.users.findMany({
          where: eq(users.id, session.userId),
          columns: { id: true },
        });
    allowedUserIds = deptUsers.map((u) => u.id);
  }

  // Load submissions scoped to department
  const rawSubmissions = allowedUserIds && allowedUserIds.length === 0
    ? []
    : await db.query.submissions.findMany({
        where: allowedUserIds ? inArray(submissions.userId, allowedUserIds) : undefined,
        with: { user: { columns: { name: true, email: true, role: true } } },
        orderBy: [desc(submissions.createdAt)],
        limit: 100,
      });

  // Mask superadmin role for non-superadmin viewers
  const allSubmissions = rawSubmissions.map((s) => {
    if (!isSuperadmin && s.user && (s.user as { role?: string }).role === "superadmin") {
      return {
        ...s,
        user: {
          ...s.user,
          role: "admin" as Role,
        },
      };
    }
    return s;
  });

  const todaySubmissions = allSubmissions.filter((s) => s.reportDate === today);

  return (
    <div className="page-container fade-in">
      <div style={{ marginBottom: "1.75rem" }}>
        <h1 style={{ fontSize: "1.4rem", marginBottom: 4 }}>
          {deptName ? `${deptName} Reports Review` : "Team Reports Review"}
        </h1>
        <p style={{ color: "#64748b", fontSize: "0.875rem", margin: 0 }}>
          {deptName && <span style={{ color: "#818cf8", fontWeight: 600 }}>{deptName} Department · </span>}
          Read-only aggregated view of daily reports submitted by your department.
        </p>
      </div>

      {/* Today's submissions */}
      <div className="card" style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2 style={{ fontSize: "1.1rem", margin: 0 }}>Today&apos;s Reports ({today})</h2>
          <span className="badge badge-info">{todaySubmissions.length} Received</span>
        </div>

        {todaySubmissions.length === 0 ? (
          <p style={{ color: "#64748b", fontSize: "0.875rem" }}>No reports submitted yet today.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {todaySubmissions.map((s) => (
              <AdminSubmissionCard
                key={s.id}
                submission={s as Parameters<typeof AdminSubmissionCard>[0]["submission"]}
                canEdit={false} // Reviewer is read-only
              />
            ))}
          </div>
        )}
      </div>

      {/* Historical Submissions */}
      <div className="card">
        <h2 style={{ fontSize: "1.1rem", marginBottom: "1rem" }}>Submission Archive</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {allSubmissions.map((s) => (
            <AdminSubmissionCard
              key={s.id}
              submission={s as Parameters<typeof AdminSubmissionCard>[0]["submission"]}
              canEdit={false}
              compact
            />
          ))}
        </div>
      </div>
    </div>
  );
}
