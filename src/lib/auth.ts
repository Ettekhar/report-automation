import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Creates a Better Auth instance bound to the given D1 database.
 *
 * Called per-request (never at module scope) to avoid D1 binding
 * lifecycle issues on Cloudflare Workers.
 *
 * BOOTSTRAP_ADMIN_EMAIL: if set and a user with that email signs in,
 * they will be granted the "admin" role automatically.
 * Also, the first user ever created in the system is automatically made "admin".
 */
export function createAuth(db: D1Database) {
  const drizzleDB = drizzle(db, { schema });

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
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID || "",
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      },
    },

    trustedOrigins: [
      "http://localhost:3000",
      "https://*.workers.dev",
      "https://*.pages.dev",
      process.env.BETTER_AUTH_URL || "",
    ].filter(Boolean),

    user: {
      additionalFields: {
        role: {
          type: "string",
          defaultValue: "member",
          input: false, // users cannot set their own role
        },
      },
    },

    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            const bootstrapEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
            const isBootstrapEmail =
              bootstrapEmail &&
              user.email?.toLowerCase() === bootstrapEmail.toLowerCase();

            // Check if this is the first user in the system
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

    secret: process.env.BETTER_AUTH_SECRET || "default_secret_for_development_min_32_chars",
    baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  });
}

export type Auth = ReturnType<typeof createAuth>;
