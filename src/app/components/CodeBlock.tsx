import { useEffect, useMemo, useRef, useState } from 'react';
import {
  foldsContaining,
  outline,
  rowSearchText,
  visibleRows,
  type JsonRow,
  type JsonRowKind,
} from '../../lib/json/outline';
import { RawNumber, parseJson } from '../../lib/json/parseJson';
import { sliceSegment, type IndexedRange } from '../../lib/search';
import { FindBar, useFind, type Find } from './FindBar';

/**
 * Past this the DOM row count starts costing more than the extra lines are
 * worth. The 1MB character cap in execute() runs first; this catches a body
 * that is small in bytes but enormous in lines.
 */
const MAX_ROWS = 5000;

const INDENT_EM = 1.2;

function Gutter({ n, width }: { n: number | null; width: string }) {
  return (
    <span className="code-gutter mono" style={{ width }} aria-hidden="true">
      {n ?? ''}
    </span>
  );
}

/** One rendered span, with any matched substrings marked. */
function Segment({
  text,
  offset,
  ranges,
  active,
  className,
}: {
  text: string;
  offset: number;
  ranges: readonly IndexedRange[];
  active: number;
  className?: string;
}) {
  if (ranges.length === 0) {
    return className ? <span className={className}>{text}</span> : <>{text}</>;
  }

  const pieces = sliceSegment(text, offset, ranges);
  const body = pieces.map((piece, index) =>
    piece.match === null ? (
      // eslint-disable-next-line react/no-array-index-key -- pieces are positional
      <span key={index}>{piece.text}</span>
    ) : (
      <mark
        // eslint-disable-next-line react/no-array-index-key -- pieces are positional
        key={index}
        className={`find-hit${piece.match === active ? ' find-hit-active' : ''}`}
      >
        {piece.text}
      </mark>
    ),
  );

  return className ? <span className={className}>{body}</span> : <>{body}</>;
}

function Truncated({ hidden, width }: { hidden: number; width: string }) {
  return (
    <div className="code-row">
      <Gutter n={null} width={width} />
      <span className="code-line mono text-muted">
        … {hidden.toLocaleString()} more lines not shown
      </span>
    </div>
  );
}

/** Scroll the active match into view whenever it moves. */
function useScrollToMatch(find: Find, containerRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (find.activeRow === null) return;
    const target = containerRef.current?.querySelector<HTMLElement>(
      `[data-row="${find.activeRow}"]`,
    );
    target?.scrollIntoView({ block: 'center' });
  }, [find.activeRow, find.active, containerRef]);
}

/** Plain text with line numbers, for anything that is not JSON. */
function TextView({ text }: { text: string }) {
  const all = useMemo(() => text.split('\n'), [text]);
  // Search only what is on screen. Matching the lines beyond the cap reported
  // hits that Enter could never reach: there is no row to scroll to, so the
  // counter advanced and nothing moved.
  const lines = useMemo(() => all.slice(0, MAX_ROWS), [all]);
  const find = useFind(lines);
  const containerRef = useRef<HTMLDivElement>(null);
  useScrollToMatch(find, containerRef);

  const hidden = Math.max(0, all.length - MAX_ROWS);
  const width = `${String(lines.length).length}ch`;

  return (
    <>
      <FindBar find={find} />
      <div className="code" ref={containerRef}>
        {lines.map((line, index) => (
          // eslint-disable-next-line react/no-array-index-key -- lines are positional
          <div className="code-row" key={index} data-row={index}>
            <Gutter n={index + 1} width={width} />
            <span className="code-line mono">
              {line === '' ? (
                ' '
              ) : (
                <Segment
                  text={line}
                  offset={0}
                  ranges={find.rangesFor(index)}
                  active={find.active}
                />
              )}
            </span>
          </div>
        ))}
        {hidden > 0 && <Truncated hidden={hidden} width={width} />}
      </div>
    </>
  );
}

/**
 * Same color mapping as the request Body editor's JSON highlighting
 * (JsonBodyEditor.tsx), so a value reads the same in both panes.
 */
function kindClass(kind: JsonRowKind): string {
  switch (kind) {
    case 'string':
      return 'code-string';
    case 'number':
      return 'code-number';
    case 'boolean':
    case 'null':
      return 'code-bool-null';
    case 'punct':
      return 'code-punct';
  }
}

/** JSON with line numbers, foldable objects and arrays, and search. */
function JsonView({ value }: { value: unknown }) {
  const rows = useMemo(() => outline(value), [value]);
  // Rows past the cap cannot be rendered, and a row inside the cap is always
  // reachable: unfolding its ancestors can only move it earlier in the visible
  // list. So capping the searchable set here is exactly "every hit is a hit
  // the viewer can show".
  const searchable = useMemo(() => rows.slice(0, MAX_ROWS).map(rowSearchText), [rows]);
  const [folded, setFolded] = useState<ReadonlySet<number>>(new Set());

  const find = useFind(searchable);
  const containerRef = useRef<HTMLDivElement>(null);

  // A hit inside a collapsed range opens its ancestors, so navigating never
  // lands on a row the viewer is refusing to draw.
  useEffect(() => {
    if (find.activeRow === null) return;
    const enclosing = foldsContaining(rows, find.activeRow);
    setFolded((current) => {
      if (!enclosing.some((index) => current.has(index))) return current;
      const next = new Set(current);
      for (const index of enclosing) next.delete(index);
      return next;
    });
  }, [find.activeRow, find.active, rows]);

  useScrollToMatch(find, containerRef);

  const visible = useMemo(() => visibleRows(rows, folded), [rows, folded]);
  const shown = visible.slice(0, MAX_ROWS);
  const hidden = visible.length - shown.length;
  const width = `${String(rows.length).length}ch`;

  const toggle = (index: number) =>
    setFolded((current) => {
      const next = new Set(current);
      if (!next.delete(index)) next.add(index);
      return next;
    });

  return (
    <>
      <FindBar find={find} />
      <div className="code" ref={containerRef}>
        {shown.map((index) => {
          const row = rows[index] as JsonRow;
          const isFolded = row.fold !== undefined && folded.has(index);
          const ranges = find.rangesFor(index);
          const textOffset = row.prefix.length;

          return (
            <div className="code-row" key={index} data-row={index}>
              <Gutter n={index + 1} width={width} />

              {row.fold ? (
                <button
                  type="button"
                  className="code-fold"
                  aria-expanded={!isFolded}
                  aria-label={isFolded ? `Expand ${row.fold.summary}` : 'Collapse'}
                  onClick={() => toggle(index)}
                >
                  {isFolded ? '▸' : '▾'}
                </button>
              ) : (
                <span className="code-fold" aria-hidden="true" />
              )}

              <span
                className="code-line mono"
                style={{ paddingLeft: `${row.depth * INDENT_EM}em` }}
              >
                <Segment
                  text={row.prefix}
                  offset={0}
                  ranges={ranges}
                  active={find.active}
                  className="code-key"
                />
                <Segment
                  text={row.text}
                  offset={textOffset}
                  ranges={ranges}
                  active={find.active}
                  className={kindClass(row.kind)}
                />
                {isFolded && row.fold ? (
                  <>
                    <button
                      type="button"
                      className="code-summary"
                      onClick={() => toggle(index)}
                      title="Expand"
                    >
                      {row.fold.summary}
                    </button>
                    <span className="code-punct">{row.fold.close}</span>
                    <span className="code-punct">{row.comma}</span>
                  </>
                ) : (
                  <Segment
                    text={row.comma}
                    offset={textOffset + row.text.length}
                    ranges={ranges}
                    active={find.active}
                    className="code-punct"
                  />
                )}
              </span>
            </div>
          );
        })}
        {hidden > 0 && <Truncated hidden={hidden} width={width} />}
      </div>
    </>
  );
}

/**
 * Renders a response body: a foldable tree when it is JSON, plain numbered
 * lines otherwise. Truncated bodies are never valid JSON, so they fall through
 * to the text view by construction.
 */
export function CodeBlock({ text }: { text: string }) {
  const parsed = useMemo(() => {
    try {
      const value: unknown = parseJson(text);
      return typeof value === 'object' && value !== null && !(value instanceof RawNumber)
        ? { ok: true as const, value }
        : null;
    } catch {
      return null;
    }
  }, [text]);

  return parsed ? <JsonView value={parsed.value} /> : <TextView text={text} />;
}
