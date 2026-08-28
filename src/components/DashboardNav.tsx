"use client";

import { usePathname } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import type { Role } from "@/lib/permissions";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  roles: Role[];
}

const NAV_ITEMS: NavItem[] = [
  { href: "/member",           label: "My Dashboard",   icon: "🏠", roles: ["member", "admin", "reviewer"] },
  { href: "/reviewer",         label: "All Reports",    icon: "👁️",  roles: ["reviewer", "admin"] },
  { href: "/admin",            label: "Admin View",     icon: "📊", roles: ["admin"] },
  { href: "/admin/schedule",   label: "Schedule",       icon: "📅", roles: ["admin"] },
  { href: "/admin/users",      label: "Users",          icon: "👥", roles: ["admin"] },
  { href: "/admin/export",     label: "Export Dataset", icon: "📦", roles: ["admin"] },
];

export default function DashboardNav({
  role,
  userName,
}: {
  role: Role;
  userName: string;
}) {
  const pathname = usePathname();
  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(role));

  return (
    <>
      {/* ── Sidebar (desktop) ─────────────────────────────────────── */}
      <aside className="sidebar" style={{ display: "none" }}>
        <style>{`
          @media (min-width: 768px) {
            aside.sidebar { display: flex !important; }
          }
        `}</style>

        {/* Brand */}
        <div style={{ padding: "0.25rem 0.5rem 1.25rem", borderBottom: "1px solid rgba(255,255,255,0.06)", marginBottom: "0.75rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #4f46e5, #818cf8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
              📋
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#f8fafc" }}>Daily Report</div>
              <div style={{ fontSize: "0.7rem", color: "#475569", textTransform: "capitalize" }}>{role}</div>
            </div>
          </div>
        </div>

        {/* Nav links */}
        <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {visibleItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <a
                key={item.href}
                href={item.href}
                className={`nav-link ${isActive ? "active" : ""}`}
                id={`nav-${item.href.replace(/\//g, "-").slice(1)}`}
              >
                <span aria-hidden="true">{item.icon}</span>
                {item.label}
              </a>
            );
          })}
        </nav>

        <div style={{ marginTop: "auto", paddingTop: "1rem", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontSize: "0.8rem", color: "#64748b", padding: "0 0.5rem 0.75rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {userName}
          </div>
          <button
            className="btn btn-ghost btn-sm"
            style={{ width: "100%" }}
            onClick={() => {
              signOut({ fetchOptions: { onSuccess: () => { window.location.href = "/login"; } } });
            }}
            id="sign-out-btn"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Top bar (mobile) ──────────────────────────────────────── */}
      <div className="top-bar">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: "linear-gradient(135deg, #4f46e5, #818cf8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
            📋
          </div>
          <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>Daily Report</span>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            signOut({ fetchOptions: { onSuccess: () => { window.location.href = "/login"; } } });
          }}
          id="sign-out-mobile-btn"
        >
          Sign out
        </button>
      </div>

      {/* ── Bottom nav (mobile) ───────────────────────────────────── */}
      <nav className="bottom-nav">
        {visibleItems.slice(0, 5).map((item) => {
          const isActive = pathname === item.href;
          return (
            <a
              key={item.href}
              href={item.href}
              className={`nav-link ${isActive ? "active" : ""}`}
              style={{ flexDirection: "column", gap: 2, padding: "0.35rem 0.5rem", fontSize: "0.65rem", textAlign: "center", minWidth: 48 }}
              id={`bottom-nav-${item.href.replace(/\//g, "-").slice(1)}`}
            >
              <span style={{ fontSize: 18 }} aria-hidden="true">{item.icon}</span>
              <span>{item.label.split(" ")[0]}</span>
            </a>
          );
        })}
      </nav>
    </>
  );
}
