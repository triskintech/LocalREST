/** A hit, addressed by line and character offsets within that line. */
export type Match = { row: number; start: number; end: number };

/**
 * Every occurrence of `query` across `lines`, in reading order.
 *
 * Plain substring search rather than regex: a response body is full of
 * characters that are regex syntax — braces, brackets, dots, question marks —
 * so treating the query as a pattern would surprise more often than help.
 */
export function findMatches(
  lines: readonly string[],
  query: string,
  caseSensitive = false,
): Match[] {
  if (query === '') return [];

  const needle = caseSensitive ? query : query.toLowerCase();
  const matches: Match[] = [];

  lines.forEach((line, row) => {
    const haystack = caseSensitive ? line : line.toLowerCase();
    let from = 0;
    for (;;) {
      const index = haystack.indexOf(needle, from);
      if (index === -1) break;
      matches.push({ row, start: index, end: index + needle.length });
      // Non-overlapping, so searching "aa" in "aaaa" finds two, not three.
      from = index + needle.length;
    }
  });

  return matches;
}

/** A match paired with its position in the overall result list. */
export type IndexedRange = { start: number; end: number; index: number };

export type Piece = {
  text: string;
  /** The match this piece belongs to, or null for ordinary text. */
  match: number | null;
};

/**
 * Cut one rendered segment into highlighted and plain pieces.
 *
 * Lines are drawn as several spans (a key, a value, a trailing comma) but
 * matched as one string, so each span is sliced against the line's ranges
 * using its offset. That keeps a match spanning two spans highlighted in both.
 */
export function sliceSegment(
  text: string,
  offset: number,
  ranges: readonly IndexedRange[],
): Piece[] {
  if (text === '') return [];

  const end = offset + text.length;
  const overlapping = ranges
    .filter((range) => range.start < end && range.end > offset)
    .sort((a, b) => a.start - b.start);

  if (overlapping.length === 0) return [{ text, match: null }];

  const pieces: Piece[] = [];
  let cursor = offset;

  for (const range of overlapping) {
    const from = Math.max(range.start, offset);
    const to = Math.min(range.end, end);
    if (from > cursor) {
      pieces.push({ text: text.slice(cursor - offset, from - offset), match: null });
    }
    pieces.push({ text: text.slice(from - offset, to - offset), match: range.index });
    cursor = to;
  }

  if (cursor < end) pieces.push({ text: text.slice(cursor - offset), match: null });
  return pieces;
}

/** Matches grouped by line, ready for rendering. */
export function rangesByRow(matches: readonly Match[]): Map<number, IndexedRange[]> {
  const byRow = new Map<number, IndexedRange[]>();
  matches.forEach((match, index) => {
    const list = byRow.get(match.row) ?? [];
    list.push({ start: match.start, end: match.end, index });
    byRow.set(match.row, list);
  });
  return byRow;
}
