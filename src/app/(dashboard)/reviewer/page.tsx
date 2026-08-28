import { getSession, getRequestDeps } from "@/lib/api-helpers";
import { redirect } from "next/navigation";
import { can } from "@/lib/permissions";
import { submissions } from "@/db/schema";
import { desc } from "drizzle-orm";
import { todayInTeamTZ } from "@/lib/timezone";
import AdminSubmissionCard from "@/components/AdminSubmissionCard";

export const dynamic = "force-dynamic";

export default async function ReviewerPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.userRole, "view:all")) redirect("/member");

  const { db } = await getRequestDeps();
  const today = todayInTeamTZ();

  // Load all submissions sorted by latest
  const allSubmissions = await db.query.submissions.findMany({
    with: { user: { columns: { name: true, email: true } } },
    orderBy: [desc(submissions.createdAt)],
    limit: 100,
  });

  const todaySubmissions = allSubmissions.filter((s) => s.reportDate === today);

  return (
    <div className="page-container fade-in">
      <div style={{ marginBottom: "1.75rem" }}>
        <h1 style={{ fontSize: "1.4rem", marginBottom: 4 }}>Team Reports Review</h1>
        <p style={{ color: "#64748b", fontSize: "0.875rem", margin: 0 }}>
          Read-only aggregated view of all team members&apos; submitted daily reports.
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
