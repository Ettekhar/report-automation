import { getCloudflareContext } from "@opennextjs/cloudflare";

// Temporary debug endpoint — checks which env vars are present in the Worker.
// Remove this after confirming env vars are correctly loaded.
export async function GET() {
  try {
    const ctx = await getCloudflareContext({ async: true });
    const env = ctx.env as unknown as Record<string, unknown>;
    const googleClientId = env["GOOGLE_CLIENT_ID"] || process.env.GOOGLE_CLIENT_ID;
    const googleClientSecret = env["GOOGLE_CLIENT_SECRET"] || process.env.GOOGLE_CLIENT_SECRET;
    const betterAuthSecret = env["BETTER_AUTH_SECRET"] || process.env.BETTER_AUTH_SECRET;
    const betterAuthUrl = env["BETTER_AUTH_URL"] || process.env.BETTER_AUTH_URL;
    const bootstrapEmail = env["BOOTSTRAP_ADMIN_EMAIL"] || process.env.BOOTSTRAP_ADMIN_EMAIL;

    return Response.json({
      hasGoogleClientId: !!googleClientId,
      hasGoogleClientSecret: !!googleClientSecret,
      hasBetterAuthSecret: !!betterAuthSecret,
      hasBetterAuthUrl: !!betterAuthUrl,
      betterAuthUrl: (betterAuthUrl as string) ?? "NOT SET",
      hasBootstrapEmail: !!bootstrapEmail,
      envKeys: Object.keys(env || {}),
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
