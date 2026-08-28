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
}

// ---------------------------------------------------------------------------
// Parse raw WhatsApp export into message blocks
// ---------------------------------------------------------------------------
const MSG_REGEX =
  /\[\s*(\d{1,2}[:.]\d{2}\s?[ap]\.?m\.?)\s*,\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s*\]\s*([^:]+):\s*/gi;

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
// Extract a numeric count from a block of text using regex patterns
// ---------------------------------------------------------------------------
function extractCount(text: string, patterns: RegExp[]): number | null {
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return parseInt(m[1] ?? m[2], 10);
  }
  return null;
}

function sumField(blocks: MessageBlock[], patterns: RegExp[]): number {
  let total = 0;
  for (const b of blocks) {
    const val = extractCount(b.text, patterns);
    if (val !== null) total += val;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Build typo-tolerant regex patterns for each field
// (same logic as original tool — word stems + fuzzy chars)
// ---------------------------------------------------------------------------
const SEP = "[\\s:.\\-]*";

const PATTERNS = {
  review: [
    new RegExp(`re[a-z]{0,3}v[a-z]{0,3}iew${SEP}(\\d+)`, "i"),
    new RegExp(`(\\d+)${SEP}re[a-z]{0,3}view`, "i"),
  ],
  progress: [
    new RegExp(`prog[a-z]{0,4}${SEP}(\\d+)`, "i"),
    new RegExp(`(\\d+)${SEP}prog[a-z]{0,4}`, "i"),
  ],
  done: [
    new RegExp(`comp[a-z]{0,6}${SEP}(\\d+)`, "i"),
    new RegExp(`(\\d+)${SEP}comp[a-z]{0,6}`, "i"),
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
};

/**
 * Auto-sum status counts from parsed message blocks.
 * Returns partial counts; user can override any value.
 */
export function extractStatusCounts(blocks: MessageBlock[]): StatusCounts {
  return {
    inReview: sumField(blocks, PATTERNS.review),
    inProgress: sumField(blocks, PATTERNS.progress),
    done: sumField(blocks, PATTERNS.done),
    overdueDependencies: sumField(blocks, PATTERNS.overdueDep),
    overdue: sumField(blocks, PATTERNS.overdue),
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
