import { redirect } from "next/navigation";
import { getSession } from "@/lib/api-helpers";
import { can } from "@/lib/permissions";
import SettingsPanel from "@/components/SettingsPanel";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.userRole, "manage:settings")) redirect("/admin");

  return (
    <div className="page-container fade-in">
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.4rem", marginBottom: 4 }}>App Settings</h1>
        <p style={{ color: "#64748b", fontSize: "0.875rem", margin: 0 }}>
          Superadmin-only controls for the daily report workflow.
        </p>
      </div>

      <SettingsPanel />
    </div>
  );
}