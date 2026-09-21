import { NextResponse } from "next/server";
import { requireSession, getRequestDeps, withErrorHandling } from "@/lib/api-helpers";
import { requirePermission } from "@/lib/permissions";
import { appSettings } from "@/db/schema";
import { sql } from "drizzle-orm";
import type { DB } from "@/db/client";

/**
 * Global application settings, stored as key/value JSON in D1 (`app_settings`).
 *
 * Keys (defaults):
 *   autoSaveOnGenerate: true
 *     When true, clicking "Generate report" immediately saves the submission
 *     (POST or PATCH) instead of only building a preview. Superadmin can
 *     turn this off so users must explicitly click "Save submission".
 */

export const APP_SETTING_DEFAULTS: Record<string, unknown> = {
  autoSaveOnGenerate: true,
};

async function readSettings(db: DB) {
  const stored: Record<string, unknown> = {};
  try {
    const rows = await db.select().from(appSettings);
    for (const row of rows) {
      try {
        stored[row.key] = JSON.parse(row.value);
      } catch {
        stored[row.key] = row.value;
      }
    }
  } catch (e) {
    // Table may not be migrated yet (e.g. prod D1 not updated). Fall back to
    // defaults so the form/settings UI still behave correctly until `0003_app_settings.sql`
    // is applied. Log instead of crashing.
    console.warn("[settings] app_settings table unavailable, using defaults:", (e as Error)?.message);
  }
  return { ...APP_SETTING_DEFAULTS, ...stored };
}

// ---------------------------------------------------------------------------
// GET /api/settings — read current settings (any signed-in user)
// ---------------------------------------------------------------------------
export async function GET() {
  return withErrorHandling(async () => {
    await requireSession();
    const { db } = await getRequestDeps();
    return NextResponse.json(await readSettings(db));
  });
}

// ---------------------------------------------------------------------------
// PUT /api/settings — update settings (superadmin only)
// ---------------------------------------------------------------------------
export async function PUT(req: Request) {
  return withErrorHandling(async () => {
    const session = await requireSession();
    requirePermission(session.userRole, "manage:settings");

    const body = (await req.json()) as Record<string, unknown>;
    const { db } = await getRequestDeps();

    const updated: Record<string, unknown> = {};

    // Only allow known setting keys.
    for (const key of Object.keys(APP_SETTING_DEFAULTS)) {
      if (body[key] !== undefined && typeof body[key] === "boolean") {
        const value = body[key] ? "true" : "false";
        await db
          .insert(appSettings)
          .values({ key, value })
          .onConflictDoUpdate({
            target: appSettings.key,
            set: { value, updatedAt: sql`(unixepoch())` },
          });
        updated[key] = body[key];
      }
    }

    return NextResponse.json({ ok: true, updated, settings: await readSettings(db) });
  });
}