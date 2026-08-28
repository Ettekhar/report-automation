/**
 * Timezone-aware cutoff logic.
 *
 * The edit cutoff for a submission is 11:59 PM in TEAM_TIMEZONE on the
 * same calendar date as the submission.
 *
 * TEAM_TIMEZONE defaults to "Asia/Dhaka" (UTC+6). To change it, set the
 * TEAM_TIMEZONE environment variable (any IANA timezone string, e.g.
 * "America/New_York", "Europe/London").
 */

export function getTeamTimezone(): string {
  return process.env.TEAM_TIMEZONE ?? "Asia/Dhaka";
}

/**
 * Returns the current date string (YYYY-MM-DD) in the team timezone.
 */
export function todayInTeamTZ(): string {
  return toTeamDateString(new Date());
}

/**
 * Converts a Date to a YYYY-MM-DD string in the team timezone.
 */
export function toTeamDateString(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: getTeamTimezone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Returns true if a submission for the given reportDate can still be edited
 * by a regular team member (i.e., it's still the same calendar day in the
 * team timezone and before 23:59:59).
 *
 * Admins bypass this check entirely — enforced at the API layer.
 */
export function isWithinEditCutoff(reportDate: string): boolean {
  const today = todayInTeamTZ();
  if (reportDate !== today) return false;

  // Check current time in team TZ
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: getTeamTimezone(),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0");

  // Cutoff: 23:59 (11:59 PM)
  return hour < 23 || (hour === 23 && minute <= 59);
}
