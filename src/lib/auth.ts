import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Env vars that Better Auth needs at runtime.
 * These are read from the Cloudflare Worker env (via getCloudflareContext)
 * to ensure they are available on Cloudflare Workers where process.env
 * may not reflect Dashboard secrets/variables.
 */
export interface AuthEnv {
  googleClientId?: string;
  googleClientSecret?: string;
  betterAuthSecret?: string;
  betterAuthUrl?: string;
  bootstrapAdminEmail?: string;
}

/**
 * Creates a Better Auth instance bound to the given D1 database.
 *
 * Called per-request (never at module scope) to avoid D1 binding
 * lifecycle issues on Cloudflare Workers.
 *
 * Pass `authEnv` explicitly from the Cloudflare context so that secrets
 * set in the Cloudflare Dashboard are reliably available at runtime.
 */
export function createAuth(db: D1Database, authEnv: AuthEnv = {}) {
  const drizzleDB = drizzle(db, { schema });

  // Prefer explicitly-passed values (from Cloudflare context), then process.env fallback for local dev
  const clientId = authEnv.googleClientId ?? process.env.GOOGLE_CLIENT_ID ?? "";
  const clientSecret = authEnv.googleClientSecret ?? process.env.GOOGLE_CLIENT_SECRET ?? "";
  const secret = authEnv.betterAuthSecret ?? process.env.BETTER_AUTH_SECRET ?? "default_secret_for_development_min_32_chars";
  const baseURL = authEnv.betterAuthUrl ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const bootstrapEmail = authEnv.bootstrapAdminEmail ?? process.env.BOOTSTRAP_ADMIN_EMAIL;

  return betterAuth({
    database: drizzleAdapter(drizzleDB, {
      provider: "sqlite",
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
      },
    }),

    socialProviders: {
      google: { clientId, clientSecret },
    },

    trustedOrigins: [
      "http://localhost:3000",
      "https://*.workers.dev",
      "https://*.pages.dev",
      baseURL,
    ].filter(Boolean),

    user: {
      additionalFields: {
        role: {
          type: "string",
          defaultValue: "member",
          input: false,
        },
      },
    },

    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            const isBootstrapEmail =
              bootstrapEmail &&
              user.email?.toLowerCase() === bootstrapEmail.toLowerCase();

            const userCount = await drizzleDB.select().from(schema.users);
            const isFirstUser = userCount.length <= 1;

            if (isBootstrapEmail || isFirstUser) {
              await drizzleDB
                .update(schema.users)
                .set({ role: "admin" })
                .where(eq(schema.users.id, user.id));
            }
          },
        },
      },
    },

    secret,
    baseURL,
  });
}

export type Auth = ReturnType<typeof createAuth>;
