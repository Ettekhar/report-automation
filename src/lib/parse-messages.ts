/**
 * WhatsApp message parser.
 *
 * Extracted from the original single-user tool and promoted to a shared module.
 * All functions are pure — no side effects, no DOM dependencies.
 */

export interface MessageBlock {
  time: string;
  date: string;
  sender: string;
  text: string;
}

export interface StatusCounts {
  inReview: number;
  inProgress: number;
  done: number;
  overdue: number;
  overdueDependencies: number;
  /** Sum of "Maintenance - N Completed" across all message blocks. */
  maintenanceTotal: number;
  /**
   * URLs that were explicitly marked as completed by a team member.
   * A URL qualifies when it appears on the same line as, or immediately after,
   * a "completed / done" keyword — AND is NOT associated with an "in review"
   * status line (false-positive guard).
   */
  completedLinks: string[];
}

// ---------------------------------------------------------------------------
// Parse raw WhatsApp export into message blocks
// ---------------------------------------------------------------------------
const MSG_REGEX =
  /\[\s*(\d{1,2}[:.]?\d{2}\s?[ap]\.?m\.?)\s*,\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s*\]\s*([^:]+):\s*/gi;

export function parseMessages(raw: string): MessageBlock[] {
  const matches = [...raw.matchAll(MSG_REGEX)];

  if (matches.length === 0) {
    return [{ time: "", date: "", sender: "team", text: raw }];
  }

  return matches.map((match, i) => {
    const start = match.index! + match[0].length;
    const end =
      i + 1 < matches.length ? matches[i + 1].index! : raw.length;
    return {
      time: match[1].trim(),
      date: match[2].trim(),
      sender: match[3].trim(),
      text: raw.slice(start, end).trim(),
    };
  });
}

// ---------------------------------------------------------------------------
// Extract all numeric counts from text using regex patterns across all lines
// ---------------------------------------------------------------------------
const SEP = "[\\s:.\\-]*";

const PATTERNS = {
  review: [
    new RegExp(`\\bre[a-z]{0,3}v[a-z]{0,3}iew${SEP}(\\d+)`, "i"),
    new RegExp(`(\\d+)${SEP}\\bre[a-z]{0,3}view`, "i"),
  ],
  progress: [
    new RegExp(`\\bprog[a-z]{0,4}${SEP}(\\d+)`, "i"),
    new RegExp(`(\\d+)${SEP}\\bprog[a-z]{0,4}`, "i"),
  ],
  done: [
    new RegExp(`\\bcomp[a-z]{0,6}${SEP}(\\d+)`, "i"),
    new RegExp(`(\\d+)${SEP}\\bcomp[a-z]{0,6}`, "i"),
    new RegExp(`\\bdone${SEP}(\\d+)`, "i"),
  ],
  overdueDep: [
    new RegExp(
      `over[\\s\\-]?due${SEP}\\(?${SEP}depend[a-z]{0,6}\\)?${SEP}(\\d+)`,
      "i"
    ),
  ],
  overdue: [
    new RegExp(`over[\\s\\-]?due${SEP}(\\d+)(?!.*depend)`, "i"),
  ],
  /**
   * Matches "Maintenance - N Completed" / "Maintenances - N completed" / "Maintenance completed - N", etc.
   */
  maintenance: [
    new RegExp(`mainten[a-z]{0,5}${SEP}(\\d+)${SEP}comp[a-z]{0,6}`, "i"),
    new RegExp(`mainten[a-z]{0,5}${SEP}comp[a-z]{0,6}${SEP}(\\d+)`, "i"),
    new RegExp(`comp[a-z]{0,6}${SEP}(\\d+)${SEP}mainten[a-z]{0,5}`, "i"),
    new RegExp(`comp[a-z]{0,6}${SEP}mainten[a-z]{0,5}${SEP}(\\d+)`, "i"),
  ],
};

function extractLineCount(line: string, patterns: RegExp[]): number | null {
  for (const p of patterns) {
    const m = line.match(p);
    if (m) return parseInt(m[1] ?? m[2], 10);
  }
  return null;
}

function sumField(
  blocks: MessageBlock[],
  patterns: RegExp[],
  skipIfRegex?: RegExp
): number {
  let total = 0;
  for (const b of blocks) {
    const lines = b.text.split(/\r?\n/);
    for (const line of lines) {
      if (skipIfRegex && skipIfRegex.test(line)) continue;
      const val = extractLineCount(line, patterns);
      if (val !== null) total += val;
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// Maintenance count extractor
// ---------------------------------------------------------------------------
export function extractMaintenanceCount(blocks: MessageBlock[]): number {
  return sumField(blocks, PATTERNS.maintenance);
}

// ---------------------------------------------------------------------------
// Completed-task link extractor
// ---------------------------------------------------------------------------
const URL_RE = /https?:\/\/\S+/g;

/**
 * Returns URLs that are explicitly associated with a COMPLETED task in the
 * raw WhatsApp messages. A URL is classified as a "done link" when it:
 *
 *   1. Appears on the **same line** as a "completed" / "done" keyword, OR
 *   2. Appears on subsequent non-empty line(s) under a "completed" keyword,
 *      stopping if another status section (in review, in progress, etc.) begins.
 *
 * False-positive guard: URLs on lines containing "in review" or "in progress"
 * are excluded.
 */
export function extractCompletedLinks(blocks: MessageBlock[]): string[] {
  const found = new Set<string>();

  for (const block of blocks) {
    const lines = block.text.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineLower = line.toLowerCase();

      // Skip lines that are "in review" or "in progress"
      const isReviewLine = /\bin[\s-]*re?v[a-z]*\b/i.test(line);
      const isProgressLine = /\bin[\s-]*pro?g[a-z]*\b/i.test(line);
      if (isReviewLine || isProgressLine) continue;

      // Check whether this line contains a "completed / done" keyword
      const hasDoneKeyword =
        /\bcomp[a-z]*\b/i.test(lineLower) || /\bdone\b/i.test(lineLower);

      if (hasDoneKeyword) {
        // 1. Collect URLs on this same line
        const sameLine = [...line.matchAll(URL_RE)].map((m) =>
          m[0].replace(/[.,;)]+$/, "")
        );
        sameLine.forEach((u) => found.add(u));

        // 2. Look at subsequent lines until next section or block ends
        let j = i + 1;
        while (j < lines.length) {
          const nextLine = lines[j].trim();
          if (!nextLine) {
            j++;
            continue;
          }

          // If the next line starts a new status category (in review, in progress, maintenance), stop
          const isNextStatus =
            /\bin[\s-]*re?v[a-z]*\b/i.test(nextLine) ||
            /\bin[\s-]*pro?g[a-z]*\b/i.test(nextLine) ||
            /\bmainten[a-z]*\b/i.test(nextLine) ||
            /\bover[\\s\\-]?due\b/i.test(nextLine);

          if (isNextStatus) break;

          const nextUrls = [...nextLine.matchAll(URL_RE)].map((m) =>
            m[0].replace(/[.,;)]+$/, "")
          );

          if (nextUrls.length > 0) {
            nextUrls.forEach((u) => found.add(u));
            break; // Found the link for this completed item
          }

          j++;
          // Don't search too far away (at most 3 lines)
          if (j - i > 3) break;
        }
      }
    }
  }

  return [...found];
}

/**
 * Auto-sum status counts from parsed message blocks.
 * Returns partial counts; user can override any value.
 */
export function extractStatusCounts(blocks: MessageBlock[]): StatusCounts {
  return {
    inReview: sumField(blocks, PATTERNS.review),
    inProgress: sumField(blocks, PATTERNS.progress),
    done: sumField(blocks, PATTERNS.done, /\bmainten[a-z]*\b/i),
    overdueDependencies: sumField(blocks, PATTERNS.overdueDep),
    overdue: sumField(blocks, PATTERNS.overdue),
    maintenanceTotal: extractMaintenanceCount(blocks),
    completedLinks: extractCompletedLinks(blocks),
  };
}

/**
 * Extract all URLs found in the raw text.
 */
export function extractLinks(raw: string): string[] {
  const found = [...raw.matchAll(/https?:\/\/\S+/g)].map((m) =>
    m[0].replace(/[.,]+$/, "")
  );
  return [...new Set(found)];
}
