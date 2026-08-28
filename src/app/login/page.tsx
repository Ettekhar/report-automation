"use client";

import { signIn } from "@/lib/auth-client";
import { useState } from "react";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [devLoading, setDevLoading] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleGoogleLogin() {
    setLoading(true);
    setErrorMsg(null);
    try {
      await signIn.social({
        provider: "google",
        callbackURL: "/",
      });
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message || "Google sign in failed. Ensure Google Client ID & Secret are set in .env.local");
      setLoading(false);
    }
  }

  async function handleDevLogin(name: string, email: string, role: "admin" | "member" | "reviewer") {
    setDevLoading(role);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/auth/dev-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, role }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Login failed");

      // Full document navigation so the new session cookie is attached immediately
      if (role === "admin") window.location.href = "/admin";
      else if (role === "reviewer") window.location.href = "/reviewer";
      else window.location.href = "/member";
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message || "Dev login failed");
      setDevLoading(null);
    }
  }

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "radial-gradient(ellipse at 60% 0%, rgba(99,102,241,0.18) 0%, transparent 60%), var(--color-surface-0)",
        padding: "1rem",
      }}
    >
      <div
        className="card glow fade-in"
        style={{ maxWidth: 440, width: "100%", textAlign: "center" }}
      >
        {/* Logo / Brand */}
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: "linear-gradient(135deg, var(--color-brand-600), var(--color-brand-400))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 1.25rem",
            fontSize: 26,
          }}
        >
          📋
        </div>

        <h1 style={{ fontSize: "1.5rem", marginBottom: "0.4rem" }}>
          Team Daily Report
        </h1>
        <p style={{ color: "#94a3b8", fontSize: "0.9rem", marginBottom: "1.75rem" }}>
          Sign in to access your role-based reporting dashboard.
        </p>

        {errorMsg && (
          <div className="alert alert-error" style={{ marginBottom: "1.25rem", textAlign: "left", fontSize: "0.8rem" }}>
            {errorMsg}
          </div>
        )}

        {/* ── Google OAuth Button ─────────────────────────────────────────── */}
        <button
          className="btn btn-google btn-lg"
          onClick={handleGoogleLogin}
          disabled={loading || !!devLoading}
          style={{ width: "100%", justifyContent: "center", marginBottom: "1.5rem" }}
          id="google-sign-in-btn"
        >
          {loading ? (
            <span className="spinner" />
          ) : (
            <svg width="20" height="20" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.2L39.5 6C35.4 2.3 30 0 24 0 14.7 0 6.7 5.4 2.7 13.3l7.4 5.8C12.1 13 17.6 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.4 5.8C43.8 37.5 46.5 31.4 46.5 24.5z"/>
              <path fill="#FBBC05" d="M10.1 28.9A14.5 14.5 0 0 1 9.5 24c0-1.7.3-3.3.7-4.9l-7.4-5.8A24 24 0 0 0 0 24c0 3.9.9 7.5 2.7 10.7l7.4-5.8z"/>
              <path fill="#34A853" d="M24 48c6 0 11.1-2 14.8-5.4l-7.4-5.8c-2 1.3-4.5 2.1-7.4 2.1-6.4 0-11.9-3.5-13.9-8.5l-7.4 5.8C6.7 42.6 14.7 48 24 48z"/>
            </svg>
          )}
          {loading ? "Connecting to Google…" : "Continue with Google"}
        </button>

        {/* ── Quick Dev Login (Instant role testing) ────────────────────── */}
        <div style={{ position: "relative", marginBottom: "1.5rem" }}>
          <div className="divider" style={{ margin: "0 0 1rem" }} />
          <span
            style={{
              position: "absolute",
              top: "-10px",
              left: "50%",
              transform: "translateX(-50%)",
              background: "var(--color-surface-1)",
              padding: "0 10px",
              fontSize: "0.72rem",
              color: "#64748b",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Or instant test login
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            className="btn btn-ghost"
            style={{ width: "100%", justifyContent: "space-between" }}
            onClick={() => handleDevLogin("Master Admin", "admin@company.com", "admin")}
            disabled={loading || !!devLoading}
          >
            <span>👑 <strong>Master Admin</strong> (admin@company.com)</span>
            {devLoading === "admin" ? <span className="spinner" /> : <span className="badge badge-admin">Admin</span>}
          </button>

          <button
            className="btn btn-ghost"
            style={{ width: "100%", justifyContent: "space-between" }}
            onClick={() => handleDevLogin("Alice Developer", "alice@company.com", "member")}
            disabled={loading || !!devLoading}
          >
            <span>👩‍💻 <strong>Alice Member</strong> (alice@company.com)</span>
            {devLoading === "member" ? <span className="spinner" /> : <span className="badge badge-member">Member</span>}
          </button>

          <button
            className="btn btn-ghost"
            style={{ width: "100%", justifyContent: "space-between" }}
            onClick={() => handleDevLogin("Bob Reviewer", "bob@company.com", "reviewer")}
            disabled={loading || !!devLoading}
          >
            <span>👁️ <strong>Bob Reviewer</strong> (bob@company.com)</span>
            {devLoading === "reviewer" ? <span className="spinner" /> : <span className="badge badge-reviewer">Reviewer</span>}
          </button>
        </div>

        <p style={{ color: "#475569", fontSize: "0.75rem", marginTop: "1.5rem", marginBottom: 0 }}>
          For real Google accounts: set <code>GOOGLE_CLIENT_ID</code> & <code>GOOGLE_CLIENT_SECRET</code> in <code>.env.local</code>.
        </p>
      </div>
    </main>
  );
}
