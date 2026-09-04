import { getSession, getRequestDeps } from "@/lib/api-helpers";
import { redirect } from "next/navigation";
import { can } from "@/lib/permissions";
import { users, scheduleAssignments, departments } from "@/db/schema";
import { and, gte, lte, eq, isNull, inArray } from "drizzle-orm";
import ScheduleCalendar from "@/components/ScheduleCalendar";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.userRole, "manage:schedule")) redirect("/member");

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
    columns: { id: true, name: true, email: true, role: true, departmentId: true },
    orderBy: (u, { asc }) => [asc(u.name)],
  });

  // Mask superadmin role if viewer is not superadmin
  const allUsers = rawUsers.map((u) => ({
    ...u,
    role: !isSuper && u.role === "superadmin" ? "admin" : u.role,
  }));

  const userIds = allUsers.map((u) => u.id);

  // Load assignments for current + next month
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const to = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString().slice(0, 10);

  const assignmentConditions = [
    gte(scheduleAssignments.assignedDate, from),
    lte(scheduleAssignments.assignedDate, to),
  ];

  if (!isSuper) {
    if (userIds.length === 0) {
      assignmentConditions.push(eq(scheduleAssignments.userId, "__none__"));
    } else {
      assignmentConditions.push(inArray(scheduleAssignments.userId, userIds));
    }
  }

  const assignments = await db.query.scheduleAssignments.findMany({
    where: and(...assignmentConditions),
    with: {
      user: {
        columns: { id: true, name: true, departmentId: true },
      },
    },
  });

  // Departments list for superadmin switcher or leader banner
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

  const currentDeptName = !isSuper && session.userDepartmentId
    ? (allDepts[0]?.name ?? "Your Department")
    : null;

  return (
    <div className="page-container fade-in">
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <h1 style={{ fontSize: "1.4rem", margin: 0 }}>
            {isSuper ? "Schedule Management" : "Department Schedule Management"}
          </h1>
          {currentDeptName && (
            <span className="badge badge-info" style={{ fontSize: "0.8rem" }}>
              🏢 {currentDeptName}
            </span>
          )}
        </div>
        <p style={{ color: "#64748b", fontSize: "0.875rem", margin: 0 }}>
          {isSuper
            ? "Assign team members across all departments to reporting duty dates. Click a day to assign."
            : `Assign reporting duty dates for members of ${currentDeptName || "your department"}. Click a day to assign.`}
        </p>
      </div>

      <ScheduleCalendar
        users={allUsers}
        initialAssignments={assignments.map((a) => ({
          id: a.id,
          userId: a.userId,
          assignedDate: a.assignedDate,
          userName: a.user?.name ?? "",
          departmentId: a.user?.departmentId ?? null,
        }))}
        departments={allDepts}
        isSuperadmin={isSuper}
      />
    </div>
  );
}
