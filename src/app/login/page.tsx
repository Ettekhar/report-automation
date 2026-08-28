"use client";

import { signIn } from "@/lib/auth-client";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginContent() {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const searchParams = useSearchParams();

  // When we land back on /login after a failed OAuth, clear loading and show error
  useEffect(() => {
    setLoading(false);
    const error = searchParams.get("error");
    if (error === "oauth_callback_error" || error === "oauth_error") {
      setErrorMsg("Google sign in failed. Please check that the Google OAuth credentials are correctly configured.");
    } else if (error) {
      setErrorMsg(`Sign in error: ${error}. Please try again.`);
    }
  }, [searchParams]);

  async function handleGoogleLogin() {
    setLoading(true);
    setErrorMsg(null);

    // Safety timeout — if the server hangs, unblock the button after 15 s
    const timer = setTimeout(() => {
      setLoading(false);
      setErrorMsg("Connection timed out. The server may still be starting up — please try again in a moment.");
    }, 15000);

    try {
      await signIn.social({
        provider: "google",
        callbackURL: "/",
        errorCallbackURL: "/login?error=oauth_error",
      });
      clearTimeout(timer);
    } catch (err: unknown) {
      clearTimeout(timer);
      setErrorMsg((err as Error)?.message || "Google sign in failed. Please try again.");
      setLoading(false);
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
          Sign in with your Google account to access your role-based reporting dashboard.
        </p>

        {errorMsg && (
          <div
            className="alert alert-error"
            style={{ marginBottom: "1.25rem", textAlign: "left", fontSize: "0.8rem" }}
          >
            {errorMsg}
          </div>
        )}

        {/* ── Google OAuth Button ─────────────────────────────────────────── */}
        <button
          className="btn btn-google btn-lg"
          onClick={handleGoogleLogin}
          disabled={loading}
          style={{ width: "100%", justifyContent: "center" }}
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

        <p style={{ color: "#475569", fontSize: "0.75rem", marginTop: "1.5rem", marginBottom: 0 }}>
          Only authorized team members can access this dashboard.
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
