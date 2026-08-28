import { getSession, getRequestDeps } from "@/lib/api-helpers";
import { redirect } from "next/navigation";
import { can } from "@/lib/permissions";
import { submissions } from "@/db/schema";
import ExportDataset from "@/components/ExportDataset";

export const dynamic = "force-dynamic";

export default async function AdminExportPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.userRole, "export:data")) redirect("/member");

  const { db } = await getRequestDeps();

  const allSubmissions = await db.query.submissions.findMany({
    columns: { id: true },
  });

  return (
    <div className="page-container fade-in">
      <div style={{ marginBottom: "1.75rem" }}>
        <h1 style={{ fontSize: "1.4rem", marginBottom: 4 }}>Dataset Export</h1>
        <p style={{ color: "#64748b", fontSize: "0.875rem", margin: 0 }}>
          Export historical submission pairs for language model fine-tuning or offline dataset analysis.
        </p>
      </div>

      <ExportDataset totalCount={allSubmissions.length} />
    </div>
  );
}
