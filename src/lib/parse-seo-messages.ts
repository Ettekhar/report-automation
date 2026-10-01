/**
 * SEO WhatsApp parser.
 *
 * Handles the SEO team's sectioned format, which is completely different from
 * the dev-team free-form status lines:
 *
 *   in progress:
 *   link
 *   link
 *   Completed:
 *   link
 *   link
 *   Overdue:
 *   link
 *
 * Rules:
 *   • A section may carry an explicit number ("Completed: 3") — when present
 *     that number WINS.
 *   • With no number, the count is the number of links listed underneath.
 *   • Sections may appear in any order and any subset may be missing.
 *   • Headers are matched case-insensitively and tolerate the " - " / ":" / "=".
 *
 * Pure functions only — no side effects, no DOM.
 */

export interface SeoSection {
  /** Normalised section key: "completed" | "inProgress" | "overdue" | "inReview" */
  key: SeoSectionKey;
  /** Explicit count parsed from the header, or null when only links were given */
  explicitCount: number | null;
  links: string[];
}

export type SeoSectionKey = "completed" | "inProgress" | "overdue" | "inReview";

export interface SeoParseResult {
  completed: SeoSection;
  inProgress: SeoSection;
  overdue: SeoSection;
  inReview: SeoSection;
  /** Every link found anywhere, in order, de-duplicated case-sensitively */
  allLinks: string[];
}

const URL_RE = /https?:\/\/\S+/g;

/** Header matchers, longest/most-specific first so "in progress" wins over "in". */
const HEADER_PATTERNS: Array<{ key: SeoSectionKey; re: RegExp }> = [
  { key: "inProgress", re: /^\s*in[\s\-_]*prog(?:ress|r)?\b/i },
  { key: "inReview", re: /^\s*in[\s\-_]*rev(?:iew|ew)?\b/i },
  { key: "completed", re: /^\s*(?:completed?|done|closed)\b/i },
  { key: "overdue", re: /^\s*over[\s\-_]?due\b/i },
];

/**
 * Trailing count on a header line: "Completed: 3", "Overdue - 2", "in progress = 4"
 */
const HEADER_COUNT_RE = /(\d+)\s*[.!]?\s*$/;

/**
 * Pull an explicit count off a header line.
 *
 * URLs are removed first, otherwise a header like "Completed: https://.../t/12"
 * would be read as a count of 12.
 */
function extractCount(headerLine: string): number | null {
  const m = headerLine.replace(URL_RE, " ").match(HEADER_COUNT_RE);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * WhatsApp export envelopes that sit in front of the real text. Members paste
 * the raw chat, so every line can carry a timestamp and sender before the
 * actual header. Each pattern is stripped repeatedly until the line settles.
 */
const ENVELOPE_PATTERNS: RegExp[] = [
  /^\s*\[[^\]\n]{0,60}\]\s*/,                      // [7:46 pm, 18/08/2026]
  /^\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4},?\s*/,         // 18/08/2026,
  /^\s*\d{1,2}:\d{2}(?::\d{2})?\s*[ap]\.?\s?m\.?,?\s*/i, // 7:46 pm,
  /^\s*[-–—|]\s*/,                                  // "7:46 pm - John: "
  /^\s*\+?\d[\d\s()-]{6,24}\s*:\s*/,                 // +880 1933-579811:
  /^\s*[-*•\d.)\]]+\s*/,                             // leading list bullet
];

/**
 * Remove the WhatsApp timestamp / sender envelope and any leading bullet so
 * the section header lands at the start of the line.
 *
 * Deliberately conservative: a pattern only ever strips a leading run of
 * digits/brackets, so body text and URLs are never touched.
 */
function stripEnvelope(line: string): string {
  let s = line;
  // Bounded loop: each pass must shorten the string or we stop.
  for (let i = 0; i < ENVELOPE_PATTERNS.length * 2; i++) {
    const before = s;
    for (const re of ENVELOPE_PATTERNS) s = s.replace(re, "");
    if (s === before) break;
  }
  return s.trim();
}

function emptySection(key: SeoSectionKey): SeoSection {
  return { key, explicitCount: null, links: [] };
}

function matchHeader(line: string): SeoSectionKey | null {
  // Strip the WhatsApp envelope, then require the header to start the line so
  // body text can't be mistaken for a header.
  const cleaned = stripEnvelope(line);
  for (const { key, re } of HEADER_PATTERNS) {
    if (re.test(cleaned)) return key;
  }
  return null;
}

function cleanUrl(u: string): string {
  return u.replace(/[.,;:!?)\]]+$/, "");
}

/**
 * Parse the SEO sectioned format.
 * Unlisted sections come back empty, so callers never need null checks.
 */
export function parseSeoMessage(raw: string): SeoParseResult {
  const result: SeoParseResult = {
    completed: emptySection("completed"),
    inProgress: emptySection("inProgress"),
    overdue: emptySection("overdue"),
    inReview: emptySection("inReview"),
    allLinks: [],
  };

  if (!raw || !raw.trim()) return result;

  const lines = raw.split(/\r?\n/);
  let current: SeoSectionKey | null = null;
  // Preserve insertion order across sections while de-duplicating globally.
  const seen = new Set<string>();

  for (const rawLine of lines) {
    const headerKey = matchHeader(rawLine);

    if (headerKey) {
      current = headerKey;
      // A header may itself carry the count: "Completed: 3". Read it from the
      // envelope-stripped line so a WhatsApp timestamp is never mistaken for
      // the count.
      const n = extractCount(stripEnvelope(rawLine));
      if (n !== null && result[headerKey].explicitCount === null) {
        result[headerKey].explicitCount = n;
      }
      // Links on the same line as the header (e.g. "Completed: https://...")
      for (const m of rawLine.matchAll(URL_RE)) {
        const url = cleanUrl(m[0]);
        if (!seen.has(url)) {
          seen.add(url);
          result[headerKey].links.push(url);
          result.allLinks.push(url);
        }
      }
      continue;
    }

    // Body line: collect any links into the active section.
    for (const m of rawLine.matchAll(URL_RE)) {
      const url = cleanUrl(m[0]);
      if (seen.has(url)) continue;
      seen.add(url);
      result.allLinks.push(url);
      if (current) result[current].links.push(url);
    }
  }

  return result;
}

/**
 * Resolve a section's effective count: an explicit number wins, otherwise the
 * links are counted. This is the "if number is given good, if not count the
 * links" rule.
 *
 * An explicit 0 is a real answer and is returned as 0 — only `null` (no number
 * written on the header) falls back to counting links.
 */
export function resolveSeoCount(section: SeoSection): number {
  if (section.explicitCount !== null && Number.isFinite(section.explicitCount)) {
    return Math.max(0, Math.trunc(section.explicitCount));
  }
  return section.links.length;
}
