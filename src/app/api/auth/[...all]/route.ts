import { createAuth } from "@/lib/auth";
import { getD1, getRequestDeps } from "@/lib/api-helpers";
import type { NextRequest } from "next/server";

// Re-use getRequestDeps so we get the auth instance with all env vars
// properly loaded from the Cloudflare Worker environment.
async function handler(req: NextRequest) {
  const { auth } = await getRequestDeps();
  return auth.handler(req);
}

export { handler as GET, handler as POST };
