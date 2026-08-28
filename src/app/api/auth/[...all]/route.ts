import { createAuth } from "@/lib/auth";
import { getD1 } from "@/lib/api-helpers";
import type { NextRequest } from "next/server";

export const runtime = "edge";

async function handler(req: NextRequest) {
  const d1 = await getD1();
  const auth = createAuth(d1);
  return auth.handler(req);
}

export { handler as GET, handler as POST };
