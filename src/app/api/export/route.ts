import { requireSession, getRequestDeps, withErrorHandling } from "@/lib/api-helpers";
import { requirePermission } from "@/lib/permissions";
import { submissions, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { FineTuningRecord } from "@/lib/report-formatter";

export const runtime = "edge";

/**
 * GET /api/export
 *
 * Admin-only endpoint. Streams a JSONL file where each line is a
 * fine-tuning-ready (raw_input → final_report) pair.
 *
 * Record shape matches FineTuningRecord in report-formatter.ts.
 */
export async function GET() {
  return withErrorHandling(async () => {
    const session = await requireSession();
    requirePermission(session.userRole, "export:data");

    const { db } = await getRequestDeps();

    const rows = await db.query.submissions.findMany({
      with: { user: { columns: { email: true, name: true } } },
      orderBy: (s, { asc }) => [asc(s.reportDate)],
    });

    const records: FineTuningRecord[] = rows.map((row) => ({
      id: row.id,
      date: row.reportDate,
      user_email: row.user?.email ?? "",
      user_name: row.user?.name ?? "",
      raw_input: (() => {
        try {
          return JSON.parse(row.rawInput);
        } catch {
          return { raw: row.rawInput };
        }
      })(),
      final_report: row.finalReport,
      edited: row.editCount > 0,
      edit_count: row.editCount,
      created_at: row.createdAt ? new Date(row.createdAt).toISOString() : "",
    }));

    // Stream as JSONL (one JSON object per line)
    const jsonl = records.map((r) => JSON.stringify(r)).join("\n");

    return new Response(jsonl, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Content-Disposition": `attachment; filename="daily_report_dataset_${new Date().toISOString().slice(0, 10)}.jsonl"`,
      },
    });
  });
}
