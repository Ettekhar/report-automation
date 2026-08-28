import { getCloudflareContext } from "@opennextjs/cloudflare";

// Temporary debug endpoint — checks which env vars are present in the Worker.
// Remove this after confirming env vars are correctly loaded.
export async function GET() {
  try {
    const ctx = await getCloudflareContext({ async: true });
    const env = ctx.env as unknown as Record<string, unknown>;
    return Response.json({
      hasGoogleClientId: !!env["GOOGLE_CLIENT_ID"],
      hasGoogleClientSecret: !!env["GOOGLE_CLIENT_SECRET"],
      hasBetterAuthSecret: !!env["BETTER_AUTH_SECRET"],
      hasBetterAuthUrl: !!env["BETTER_AUTH_URL"],
      betterAuthUrl: env["BETTER_AUTH_URL"] ?? "NOT SET",
      hasBootstrapEmail: !!env["BOOTSTRAP_ADMIN_EMAIL"],
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
