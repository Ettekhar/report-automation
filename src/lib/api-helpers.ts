import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDB } from "@/db/client";
import { createAuth } from "@/lib/auth";
import { headers } from "next/headers";
import type { Role } from "@/lib/permissions";
import { PermissionError } from "@/lib/permissions";
import { sessions, users } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface RequestSession {
  userId: string;
  userRole: Role;
  userEmail: string;
  userName: string;
}

/**
 * Returns the D1 binding from the Cloudflare request context asynchronously.
 * Use this in every API route and server component.
 */
export async function getD1(): Promise<D1Database> {
  const ctx = await getCloudflareContext({ async: true });
  return ctx.env.DB;
}

/**
 * Returns a Drizzle DB instance and a Better Auth instance for the
 * current request. Call once per route handler.
 */
export async function getRequestDeps() {
  const d1 = await getD1();
  const db = getDB(d1);
  const auth = createAuth(d1);
  return { d1, db, auth };
}

/**
 * Returns the authenticated session from the current request headers,
 * or null if the user is not logged in.
 */
export async function getSession(): Promise<RequestSession | null> {
  try {
    const { auth, db } = await getRequestDeps();
    const hdrs = await headers();

    // 1. Better Auth session API
    try {
      const session = await auth.api.getSession({ headers: hdrs });
      if (session?.user) {
        return {
          userId: session.user.id,
          userRole: ((session.user as { role?: string }).role ?? "member") as Role,
          userEmail: session.user.email,
          userName: session.user.name ?? "",
        };
      }
    } catch {}

    // 2. Direct cookie fallback lookup in D1
    const cookieHeader = hdrs.get("cookie") || "";
    const match = cookieHeader.match(/better-auth\.session_token=([^;]+)/);
    if (match) {
      const token = decodeURIComponent(match[1]);
      const sess = await db.query.sessions.findFirst({
        where: eq(sessions.token, token),
      });

      if (sess && new Date(sess.expiresAt) > new Date()) {
        const user = await db.query.users.findFirst({
          where: eq(users.id, sess.userId),
        });

        if (user) {
          return {
            userId: user.id,
            userRole: (user.role || "member") as Role,
            userEmail: user.email,
            userName: user.name,
          };
        }
      }
    }

    return null;
  } catch (e) {
    console.error("[Session retrieval error]", e);
    return null;
  }
}

/**
 * Returns the session or throws a 401 response.
 */
export async function requireSession(): Promise<RequestSession> {
  const session = await getSession();
  if (!session) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return session;
}

/**
 * Wraps an API handler with error handling for PermissionError and
 * generic errors, returning clean JSON responses.
 */
export function withErrorHandling(
  handler: () => Promise<Response>
): Promise<Response> {
  return handler().catch((err: unknown) => {
    if (err instanceof Response) return err; // re-throw typed response
    if (err instanceof PermissionError) {
      return new Response(
        JSON.stringify({ error: err.message }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }
    console.error("[API Error]", err);
    return new Response(JSON.stringify({ error: (err as Error)?.message || "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  });
}
