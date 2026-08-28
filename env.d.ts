/// <reference types="@cloudflare/workers-types" />

interface CloudflareEnv {
  DB: D1Database;
  BOOTSTRAP_ADMIN_EMAIL?: string;
  TEAM_TIMEZONE?: string;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

declare module "@opennextjs/cloudflare" {
  export function getCloudflareContext(options?: { async?: boolean }): Promise<{
    env: CloudflareEnv;
    ctx: ExecutionContext;
    cf?: IncomingRequestCfProperties;
  }>;
}

declare module "*.css" {
  const content: Record<string, string>;
  export default content;
}
