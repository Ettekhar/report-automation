import { NextResponse } from "next/server";

// Dev login is disabled in production.
// Only Google OAuth is supported.
export async function POST() {
  return NextResponse.json(
    { error: "Dev login is disabled. Please use Google OAuth to sign in." },
    { status: 403 }
  );
}
