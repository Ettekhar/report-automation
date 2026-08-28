import { createAuthClient } from "better-auth/react";

/**
 * Client-side Better Auth instance.
 * Import this in client components for signIn, signOut, useSession, etc.
 */
export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? window.location.origin : "",
});

export const { signIn, signOut, useSession } = authClient;
