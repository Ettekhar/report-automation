import { NextResponse } from "next/server";
import { getRequestDeps } from "@/lib/api-helpers";
import { users, sessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { Role } from "@/lib/permissions";



interface DevLoginBody {
  email: string;
  name: string;
  role: Role;
}

export async function POST(req: Request) {
  try {
    const { db } = await getRequestDeps();
    const body = (await req.json()) as DevLoginBody;

    const email = body.email.toLowerCase().trim();
    const name = body.name.trim();
    const role = body.role || "member";

    // 1. Find or create user
    let user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user) {
      const id = crypto.randomUUID();
      await db.insert(users).values({
        id,
        name,
        email,
        role,
      });
      user = await db.query.users.findFirst({
        where: eq(users.id, id),
      });
    } else if (user.role !== role) {
      await db.update(users).set({ role }).where(eq(users.id, user.id));
      user.role = role;
    }

    if (!user) {
      return NextResponse.json({ error: "Failed to initialize user" }, { status: 500 });
    }

    // 2. Create a session token valid for 7 days
    const sessionToken = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db.insert(sessions).values({
      id: sessionId,
      token: sessionToken,
      userId: user.id,
      expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 3. Set Better Auth session cookie
    // Better Auth cookie names: 'better-auth.session_token'
    const res = NextResponse.json({ success: true, role: user.role, name: user.name });

    res.cookies.set("better-auth.session_token", sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
      secure: process.env.NODE_ENV === "production",
    });

    return res;
  } catch (err: unknown) {
    console.error("[Dev Login Error]", err);
    return NextResponse.json({ error: (err as Error)?.message || "Login failed" }, { status: 500 });
  }
}
