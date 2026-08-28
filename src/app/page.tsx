import { redirect } from "next/navigation";
import { getSession } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/**
 * Root page — immediately redirects based on auth state and role.
 * Members → /member, Reviewers → /reviewer, Admins → /admin
 */
export default async function RootPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  switch (session.userRole) {
    case "admin":    redirect("/admin");
    case "reviewer": redirect("/reviewer");
    default:         redirect("/member");
  }
}
