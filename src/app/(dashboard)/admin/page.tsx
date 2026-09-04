import { getSession, getRequestDeps } from "@/lib/api-helpers";
import { redirect } from "next/navigation";
import { can } from "@/lib/permissions";
import { submissions, scheduleAssignments, users, departments, teamTaskLinks } from "@/db/schema";
import { eq, desc, inArray, isNull, or } from "drizzle-orm";
import { todayInTeamTZ } from "@/lib/timezone";
import AdminSubmissionCard from "@/components/AdminSubmissionCard";
import Link from "next/link";
import type { Role } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.userRole, "view:all")) redirect("/member");

  const { db } = await getRequestDeps();
  const today = todayInTeamTZ();

  const isSuperadmin = session.userRole === "superadmin";

  // Fetch department details if normal leader
  let deptName: string | null = null;
  if (session.userDepartmentId) {
    const dept = await db.query.departments.findFirst({
      where: eq(departments.id, session.userDepartmentId),
    });
    deptName = dept?.name ?? null;
  }

  // Users query: scoped by department if not superadmin
  const userCondition = !isSuperadmin
    ? session.userDepartmentId
      ? eq(users.departmentId, session.userDepartmentId)
      : isNull(users.departmentId)
    : undefined;

  const rawUsers = await db.query.users.findMany({
    where: userCondition,
    columns: { id: true, name: true, email: true, role: true, departmentId: true },
    orderBy: (u, { asc }) => [asc(u.name)],
  });

  // Invisibility: mask superadmin as admin if viewer is not superadmin
  const allUsers = rawUsers.map((u) => {
    if (!isSuperadmin && u.role === "superadmin") {
      return { ...u, role: "admin" as Role };
    }
    return u;
  });

  const deptUserIds = allUsers.map((u) => u.id);

  // Today's assignments
  const todayAssignments = deptUserIds.length > 0
    ? await db.query.scheduleAssignments.findMany({
        where: !isSuperadmin
          ? inArray(scheduleAssignments.userId, deptUserIds)
          : eq(scheduleAssignments.assignedDate, today),
      })
    : [];
  const assignedTodayIds = new Set(
    todayAssignments.filter((a) => a.assignedDate === today).map((a) => a.userId)
  );

  // Today's submissions
  const todaySubmissions = deptUserIds.length > 0
    ? await db.query.submissions.findMany({
        where: !isSuperadmin
          ? inArray(submissions.userId, deptUserIds)
          : eq(submissions.reportDate, today),
        with: { user: { columns: { name: true, email: true, role: true } } },
      })
    : [];
  const actualTodaySubs = todaySubmissions.filter((s) => s.reportDate === today);
  const submittedTodayIds = new Set(actualTodaySubs.map((s) => s.userId));

  // Recent submissions
  const recentSubmissions = deptUserIds.length > 0
    ? await db.query.submissions.findMany({
        where: !isSuperadmin ? inArray(submissions.userId, deptUserIds) : undefined,
        with: { user: { columns: { name: true, email: true, role: true } } },
        orderBy: [desc(submissions.createdAt)],
        limit: 50,
      })
    : [];

  // Team task links: department-scoped
  const linkCondition = session.userDepartmentId
    ? or(eq(teamTaskLinks.departmentId, session.userDepartmentId), isNull(teamTaskLinks.departmentId))
    : isNull(teamTaskLinks.departmentId);

  const teamLinks = await db.query.teamTaskLinks.findMany({
    where: !isSuperadmin ? linkCondition : undefined,
    orderBy: (t, { asc }) => [asc(t.sortOrder)],
  });

  // Aggregate stats for today
  const totalDone = actualTodaySubs.reduce((s, r) => s + r.tasksDone, 0);
  const totalReview = actualTodaySubs.reduce((s, r) => s + r.inReview, 0);
  const totalProgress = actualTodaySubs.reduce((s, r) => s + r.inProgress, 0);
  const totalOverdue = actualTodaySubs.reduce((s, r) => s + r.overdueTasks, 0);

  const members = allUsers.filter((u) => u.role !== "admin" && u.role !== "superadmin");
  const assignedCount = members.filter((u) => assignedTodayIds.has(u.id)).length;
  const submittedCount = members.filter((u) => submittedTodayIds.has(u.id)).length;

  return (
    <div className="page-container fade-in">
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.4rem", marginBottom: 4 }}>
          {isSuperadmin ? "Superadmin Overview" : deptName ? `${deptName} Leader Dashboard` : "Admin Dashboard"}
        </h1>
        <p style={{ color: "#64748b", fontSize: "0.875rem", margin: 0 }}>
          {deptName && <span style={{ color: "#818cf8", fontWeight: 600 }}>{deptName} Department · </span>}
          {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          {" · "}{today}
        </p>
      </div>

      {/* ── Stats row ──────────────────────────────────────────── */}
      <div className="grid-stats" style={{ marginBottom: "2rem" }}>
        {[
          { label: "Assigned Today",   value: assignedCount,  color: "var(--color-info)" },
          { label: "Submitted Today",  value: submittedCount, color: "var(--color-success)" },
          { label: "Tasks Done",       value: totalDone,      color: "var(--color-brand-400)" },
          { label: "In Review",        value: totalReview,    color: "var(--color-warning)" },
          { label: "In Progress",      value: totalProgress,  color: "var(--color-info)" },
          { label: "Overdue",          value: totalOverdue,   color: "var(--color-danger)" },
        ].map((stat) => (
          <div key={stat.label} className="stat-card">
            <span className="stat-value" style={{ color: stat.color }}>{stat.value}</span>
            <span className="stat-label">{stat.label}</span>
          </div>
        ))}
      </div>

      {/* ── Who submitted / who hasn't ─────────────────────────── */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1rem", marginBottom: "1rem" }}>Today&apos;s Status</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Assigned</th>
                <th>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {allUsers.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{u.name}</div>
                    <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{u.email}</div>
                  </td>
                  <td><span className={`badge badge-${u.role}`}>{u.role}</span></td>
                  <td>
                    {assignedTodayIds.has(u.id)
                      ? <span className="badge badge-info">Yes</span>
                      : <span className="badge badge-muted">—</span>}
                  </td>
                  <td>
                    {submittedTodayIds.has(u.id)
                      ? <span className="badge badge-success">✓ Submitted</span>
                      : assignedTodayIds.has(u.id)
                        ? <span className="badge badge-danger">Missing</span>
                        : <span className="badge badge-muted">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Team task links overview ─────────────────────────── */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>
            Team Dev Task Links ({teamLinks.length})
          </h2>
          <Link href="/admin/users" className="btn btn-ghost btn-sm">
            Manage Links &rarr;
          </Link>
        </div>

        {teamLinks.length === 0 ? (
          <p style={{ fontSize: "0.85rem", color: "#64748b" }}>No dev task links configured yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {teamLinks.map((l) => (
              <div key={l.id} style={{ fontSize: "0.8rem", padding: "2px 0" }}>
                <a href={l.url} target="_blank" rel="noopener noreferrer" style={{ wordBreak: "break-all" }}>{l.url}</a>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Today's full submissions ──────────────────────────── */}
      {todaySubmissions.length > 0 && (
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "1rem", marginBottom: "1rem" }}>
            Today&apos;s Reports
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {todaySubmissions.map((s) => (
              <AdminSubmissionCard
                key={s.id}
                submission={s as Parameters<typeof AdminSubmissionCard>[0]["submission"]}
                canEdit
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Recent activity ───────────────────────────────────── */}
      <div className="card">
        <h2 style={{ fontSize: "1rem", marginBottom: "1rem" }}>Recent Submissions</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {recentSubmissions.map((s) => (
            <AdminSubmissionCard
              key={s.id}
              submission={s as Parameters<typeof AdminSubmissionCard>[0]["submission"]}
              canEdit
              compact
            />
          ))}
        </div>
      </div>
    </div>
  );
}
