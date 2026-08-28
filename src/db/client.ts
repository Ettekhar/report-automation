/// <reference types="@cloudflare/workers-types" />
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

/**
 * Creates a Drizzle DB client bound to a D1 database instance.
 *
 * IMPORTANT: Always call this per-request — never cache at module scope.
 * Cloudflare Workers provide D1 bindings only within request context.
 */
export function getDB(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type DB = ReturnType<typeof getDB>;
