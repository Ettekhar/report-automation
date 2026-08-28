import { getSession, getRequestDeps } from "@/lib/api-helpers";
import { redirect } from "next/navigation";
import { can } from "@/lib/permissions";
import { users, scheduleAssignments } from "@/db/schema";
import { and, gte, lte } from "drizzle-orm";
import ScheduleCalendar from "@/components/ScheduleCalendar";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.userRole, "manage:schedule")) redirect("/member");

  const { db } = await getRequestDeps();

  // Load all users (for assignment dropdown)
  const allUsers = await db.query.users.findMany({
    columns: { id: true, name: true, email: true, role: true },
    orderBy: (u, { asc }) => [asc(u.name)],
  });

  // Load assignments for current + next month
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const to = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString().slice(0, 10);

  const assignments = await db.query.scheduleAssignments.findMany({
    where: and(
      gte(scheduleAssignments.assignedDate, from),
      lte(scheduleAssignments.assignedDate, to)
    ),
    with: { user: { columns: { id: true, name: true } } },
  });

  return (
    <div className="page-container fade-in">
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.4rem", marginBottom: 4 }}>Schedule Management</h1>
        <p style={{ color: "#64748b", fontSize: "0.875rem", margin: 0 }}>
          Assign which team members report on which dates. Click a day to assign.
        </p>
      </div>

      <ScheduleCalendar
        users={allUsers}
        initialAssignments={assignments.map((a) => ({
          id: a.id,
          userId: a.userId,
          assignedDate: a.assignedDate,
          userName: a.user?.name ?? "",
        }))}
      />
    </div>
  );
}
