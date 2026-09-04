import { getSession, getRequestDeps } from "@/lib/api-helpers";
import { redirect } from "next/navigation";
import { submissions, scheduleAssignments } from "@/db/schema";
import { eq, desc, and, gte } from "drizzle-orm";
import { todayInTeamTZ } from "@/lib/timezone";
import SubmissionForm from "@/components/SubmissionForm";
import MemberSubmissionHistory from "@/components/MemberSubmissionHistory";

export const dynamic = "force-dynamic";

export default async function MemberPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const { db } = await getRequestDeps();
  const today = todayInTeamTZ();

  // Load today's schedule assignment for this user
  const assignment = await db.query.scheduleAssignments.findFirst({
    where: and(
      eq(scheduleAssignments.userId, session.userId),
      eq(scheduleAssignments.assignedDate, today)
    ),
  });

  // Load all future / upcoming assignments for this user
  const upcomingAssignments = await db.query.scheduleAssignments.findMany({
    where: and(
      eq(scheduleAssignments.userId, session.userId),
      gte(scheduleAssignments.assignedDate, today)
    ),
    orderBy: (s, { asc }) => [asc(s.assignedDate)],
    limit: 30,
  });

  // Load today's existing submission (if any)
  const existing = await db.query.submissions.findFirst({
    where: and(
      eq(submissions.userId, session.userId),
      eq(submissions.reportDate, today)
    ),
  });

  // Load last 14 submissions for history
  const history = await db.query.submissions.findMany({
    where: eq(submissions.userId, session.userId),
    orderBy: [desc(submissions.createdAt)],
    limit: 14,
  });

  const isScheduledToday = !!assignment;
  const hasSubmittedToday = !!existing;

  // Group continuous upcoming dates into friendly shift blocks (e.g. "Sep 1 – Sep 7")
  const upcomingDates = upcomingAssignments.map((a) => a.assignedDate);

  return (
    <div className="page-container fade-in">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: "1.4rem", marginBottom: 4 }}>My Dashboard</h1>
          <p style={{ color: "#64748b", fontSize: "0.875rem", margin: 0 }}>
            {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            {" · "}<strong>{session.userName}</strong>
          </p>
        </div>
        {hasSubmittedToday && (
          <span className="badge badge-success" style={{ fontSize: "0.85rem", padding: "4px 12px" }}>
            ✓ Submitted today
          </span>
        )}
      </div>

      {/* ── Schedule Status Banner ────────────────────────────────── */}
      {isScheduledToday ? (
        <div className="alert alert-success" style={{ marginBottom: "1.5rem", padding: "1rem 1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: "1.5rem" }}>🌟</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: "1rem" }}>
                You are scheduled to report today! ({today})
              </div>
              <div style={{ fontSize: "0.85rem", opacity: 0.9 }}>
                {hasSubmittedToday
                  ? "✓ Your daily status update has been submitted for today. You can edit it below if needed."
                  : "Please fill out and submit your daily work status update below."}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="alert alert-info" style={{ marginBottom: "1.5rem", padding: "1rem 1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: "1.5rem" }}>📅</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>
                You are not on duty today ({today}).
              </div>
              <div style={{ fontSize: "0.82rem", opacity: 0.9, marginTop: 2 }}>
                {upcomingDates.length > 0 ? (
                  <>
                    Your next scheduled reporting shift starts on:{" "}
                    <strong>{upcomingDates[0]}</strong> ({upcomingDates.length} upcoming days assigned).
                  </>
                ) : (
                  "You have no upcoming reporting shifts assigned yet. Your Admin will assign your week soon."
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Upcoming Shifts Schedule Pill Bar ─────────────────────── */}
      {upcomingDates.length > 0 && (
        <div className="card-sm" style={{ marginBottom: "1.5rem", background: "var(--color-surface-1)" }}>
          <span className="label" style={{ marginBottom: "0.5rem" }}>
            🗓️ Your Upcoming Scheduled Reporting Days ({upcomingDates.length}):
          </span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {upcomingDates.map((d) => {
              const isToday = d === today;
              return (
                <span
                  key={d}
                  className={`badge ${isToday ? "badge-success" : "badge-member"}`}
                  style={{ fontSize: "0.78rem", padding: "3px 8px" }}
                >
                  {d} {isToday && "(Today)"}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Submission Form ───────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", flexWrap: "wrap", gap: 8 }}>
          <h2 style={{ fontSize: "1.1rem", margin: 0 }}>
            {hasSubmittedToday ? "Edit Today's Report" : "Submit Today's Report"}
          </h2>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: "0.8rem", color: "#64748b" }}>Date:</span>
            <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "#e2e8f0" }}>{today}</span>
          </div>
        </div>
        <SubmissionForm
          reportDate={today}
          isAdmin={session.userRole === "admin" || session.userRole === "superadmin"}
          existingSubmission={existing ? {
            id: existing.id,
            rawInput: existing.rawInput,
            finalReport: existing.finalReport,
            rawWhatsappText: existing.rawWhatsappText ?? undefined,
          } : null}
        />
      </div>

      {/* ── 14-Day History ────────────────────────────────────────── */}
      {history.length > 0 && (
        <div className="card">
          <h2 style={{ fontSize: "1.05rem", marginBottom: "1rem" }}>My Recent Submissions</h2>
          <MemberSubmissionHistory submissions={history} />
        </div>
      )}
    </div>
  );
}
