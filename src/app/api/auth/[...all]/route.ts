import { createAuth } from "@/lib/auth";
import { getD1, getRequestDeps } from "@/lib/api-helpers";
import type { NextRequest } from "next/server";

// =============================================================================
// Better-Auth Catch-All Route Handler (/api/auth/*)
//
// Handles all authentication endpoints including:
// - /api/auth/sign-in/social (redirects user to Google OAuth)
// - /api/auth/callback/google (receives code from Google & exchanges for session)
// - /api/auth/get-session (checks existing cookie session)
// - /api/auth/sign-out (destroys active session)
// =============================================================================
async function handler(req: NextRequest) {
  const url = req.nextUrl.toString();
  const pathname = req.nextUrl.pathname;
  const searchParams = Object.fromEntries(req.nextUrl.searchParams.entries());

  console.log(`\n======================================================`);
  console.log(`[AUTH ROUTE HANDLER] Incoming ${req.method} request to: ${pathname}`);
  console.log(`[AUTH ROUTE HANDLER] Full URL:`, url);
  console.log(`[AUTH ROUTE HANDLER] Search Params:`, searchParams);
  console.log(`======================================================`);

  try {
    // 1. Fetch dependencies & initialize Better Auth
    console.log(`[AUTH ROUTE HANDLER - STEP 1] Getting request dependencies & D1 instance...`);
    const { auth, d1 } = await getRequestDeps();
    console.log(`[AUTH ROUTE HANDLER - STEP 1 SUCCESS] D1 Database available:`, !!d1);

    // 2. Process request through Better Auth
    console.log(`[AUTH ROUTE HANDLER - STEP 2] Calling auth.handler for ${pathname}...`);
    const response = await auth.handler(req);

    const locationHeader = response.headers.get("location");
    const setCookieHeader = response.headers.get("set-cookie");

    console.log(`[AUTH ROUTE HANDLER - STEP 3 RESULT] Status: ${response.status}`);
    if (locationHeader) {
      console.log(`[AUTH ROUTE HANDLER - REDIRECT LOCATION] ->`, locationHeader);
    }
    if (setCookieHeader) {
      console.log(`[AUTH ROUTE HANDLER - SET COOKIE PRESENT] -> Yes`);
    }

    return response;
  } catch (err: unknown) {
    console.error(`[AUTH ROUTE HANDLER - CRITICAL ERROR] Exception during ${pathname}:`, err);
    return new Response(
      JSON.stringify({
        error: "Internal Auth Error",
        details: (err as Error)?.message || String(err),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

export { handler as GET, handler as POST };

