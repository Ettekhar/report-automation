import { redirect } from "next/navigation";
import { getSession } from "@/lib/api-helpers";
import DashboardNav from "@/components/DashboardNav";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="app-layout">
      <DashboardNav role={session.userRole} userName={session.userName} />
      <main style={{ overflow: "auto", minHeight: 0 }}>
        {children}
      </main>
    </div>
  );
}
