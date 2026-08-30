/**
 * Flatten parsed JSON into the exact lines `JSON.stringify(value, null, 2)`
 * would produce, annotating every line that opens an object or an array with
 * the row that closes it and how much it contains.
 *
 * Keeping this pure and line-based means the viewer can render numbers that
 * match the raw body, fold a range by skipping rows, and be tested without a
 * DOM.
 */
import { RawNumber } from './parseJson';

/**
 * What `text` is, so the viewer can color a value the same way the request
 * Body editor's JSON highlighting does. Braces/brackets get 'punct', same as
 * the comma.
 */
export type JsonRowKind = 'string' | 'number' | 'boolean' | 'null' | 'punct';

export type JsonRow = {
  /** Indentation level, for rendering. */
  depth: number;
  /** `"key": ` prefix, empty for array elements and the root. */
  prefix: string;
  /** The value on this line: a scalar, or an opening/closing bracket. */
  text: string;
  /** What `text` is, for coloring. */
  kind: JsonRowKind;
  /** Trailing comma, kept separate so a folded row can re-attach it. */
  comma: string;
  /** Present when this row opens a foldable range. */
  fold?: {
    /** Index of the row carrying the matching closing bracket. */
    closeIndex: number;
    /** e.g. "17 elements present" or "6 keys present". */
    summary: string;
    /** The closing bracket, for rendering on the folded line. */
    close: string;
  };
};

const INDENT = '  ';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof RawNumber);

/** JSON.stringify's rendering of a leaf, so folded and unfolded agree. */
function scalar(value: unknown): string {
  if (value === undefined) return 'null';
  // A number that does not fit a double is rendered from the digits the server
  // actually sent, not from the double it would have collapsed into.
  if (value instanceof RawNumber) return value.text;
  return JSON.stringify(value) ?? 'null';
}

/** What kind of leaf this is, for coloring — mirrors `scalar`'s cases. */
function scalarKind(value: unknown): JsonRowKind {
  if (value === undefined || value === null) return 'null';
  if (value instanceof RawNumber || typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'string';
}

/** e.g. "17 elements present" or "6 keys present" — shared with the fold
 * placeholder in the request Body editor's JSON view, so both read the same. */
export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many} present`;
}

export function outline(value: unknown): JsonRow[] {
  const rows: JsonRow[] = [];

  const walk = (node: unknown, depth: number, prefix: string, comma: string): void => {
    if (Array.isArray(node)) {
      if (node.length === 0) {
        rows.push({ depth, prefix, text: '[]', kind: 'punct', comma });
        return;
      }
      const openIndex = rows.length;
      rows.push({ depth, prefix, text: '[', kind: 'punct', comma: '' });
      node.forEach((item, index) => {
        walk(item, depth + 1, '', index === node.length - 1 ? '' : ',');
      });
      const closeIndex = rows.length;
      rows.push({ depth, prefix: '', text: ']', kind: 'punct', comma });
      (rows[openIndex] as JsonRow).fold = {
        closeIndex,
        summary: plural(node.length, 'element', 'elements'),
        close: ']',
      };
      return;
    }

    if (isObject(node)) {
      const keys = Object.keys(node);
      if (keys.length === 0) {
        rows.push({ depth, prefix, text: '{}', kind: 'punct', comma });
        return;
      }
      const openIndex = rows.length;
      rows.push({ depth, prefix, text: '{', kind: 'punct', comma: '' });
      keys.forEach((key, index) => {
        walk(
          node[key],
          depth + 1,
          `${JSON.stringify(key)}: `,
          index === keys.length - 1 ? '' : ',',
        );
      });
      const closeIndex = rows.length;
      rows.push({ depth, prefix: '', text: '}', kind: 'punct', comma });
      (rows[openIndex] as JsonRow).fold = {
        closeIndex,
        summary: plural(keys.length, 'key', 'keys'),
        close: '}',
      };
      return;
    }

    rows.push({ depth, prefix, text: scalar(node), kind: scalarKind(node), comma });
  };

  walk(value, 0, '', '');
  return rows;
}

/** The literal text of a row, used to prove the outline matches JSON.stringify. */
export function rowText(row: JsonRow): string {
  return `${INDENT.repeat(row.depth)}${row.prefix}${row.text}${row.comma}`;
}

/**
 * Row indices to render, given a set of folded opener indices. A folded row is
 * shown; everything up to and including its closer is skipped.
 */
export function visibleRows(rows: JsonRow[], folded: ReadonlySet<number>): number[] {
  const visible: number[] = [];
  let index = 0;
  while (index < rows.length) {
    visible.push(index);
    const row = rows[index] as JsonRow;
    index = row.fold && folded.has(index) ? row.fold.closeIndex + 1 : index + 1;
  }
  return visible;
}

/** Every foldable row, for a collapse-all affordance. */
export function foldableIndices(rows: JsonRow[]): number[] {
  return rows.flatMap((row, index) => (row.fold ? [index] : []));
}

/**
 * The foldable rows whose range encloses `index`.
 *
 * Search runs over the whole body, folded or not, so jumping to a hit inside a
 * folded range has to open its ancestors — otherwise the viewer reports a
 * match it refuses to show.
 */
export function foldsContaining(rows: readonly JsonRow[], index: number): number[] {
  const enclosing: number[] = [];
  rows.forEach((row, i) => {
    if (row.fold && i < index && index <= row.fold.closeIndex) enclosing.push(i);
  });
  return enclosing;
}

/** The full text of a row, as searched. */
export function rowSearchText(row: JsonRow): string {
  return `${row.prefix}${row.text}${row.comma}`;
}
