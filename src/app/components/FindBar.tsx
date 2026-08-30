import { useEffect, useMemo, useRef, useState } from 'react';
import { findMatches, rangesByRow, type IndexedRange } from '../../lib/search';

export type Find = {
  open: boolean;
  query: string;
  caseSensitive: boolean;
  /** Index into the match list, or -1 when there are none. */
  active: number;
  total: number;
  /** Line of the current match, for scrolling and unfolding. */
  activeRow: number | null;
  rangesFor(row: number): IndexedRange[];
  setQuery(query: string): void;
  toggleCase(): void;
  step(delta: number): void;
  close(): void;
  openFind(): void;
};

/**
 * Search state over a body's lines.
 *
 * Matching runs across every line, folded or not — reporting "No results" for
 * data that is merely collapsed would be a lie. Revealing the hit is the
 * viewer's job.
 */
export function useFind(lines: readonly string[]): Find {
  const [open, setOpen] = useState(false);
  const [query, setQueryState] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [active, setActive] = useState(0);

  // Closing the bar stops the highlighting but keeps the query, so reopening
  // resumes where you left off instead of leaving marks stuck on the page.
  const matches = useMemo(
    () => (open ? findMatches(lines, query, caseSensitive) : []),
    [open, lines, query, caseSensitive],
  );
  const byRow = useMemo(() => rangesByRow(matches), [matches]);

  // A shorter result list must not leave the cursor pointing past the end.
  const clamped = matches.length === 0 ? -1 : Math.min(active, matches.length - 1);

  useEffect(() => {
    // ⌘F / Ctrl+F belongs to the response while one is on screen: Chrome's own
    // find cannot see rows that are folded away.
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return {
    open,
    query,
    caseSensitive,
    active: clamped,
    total: matches.length,
    activeRow: clamped === -1 ? null : (matches[clamped]?.row ?? null),
    rangesFor: (row) => byRow.get(row) ?? [],
    setQuery: (next) => {
      setQueryState(next);
      setActive(0);
    },
    toggleCase: () => setCaseSensitive((value) => !value),
    step: (delta) => {
      if (matches.length === 0) return;
      setActive((current) => {
        const from = Math.min(current, matches.length - 1);
        return (from + delta + matches.length) % matches.length;
      });
    },
    close: () => setOpen(false),
    openFind: () => setOpen(true),
  };
}

export function FindBar({ find }: { find: Find }) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (find.open) inputRef.current?.select();
  }, [find.open]);

  if (!find.open) return null;

  return (
    <div className="find">
      <input
        ref={inputRef}
        className="input mono find-input"
        type="text"
        aria-label="Find in response"
        placeholder="Find in response"
        value={find.query}
        onChange={(event) => find.setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            find.step(event.shiftKey ? -1 : 1);
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            find.close();
          }
        }}
      />

      <button
        type="button"
        className={`btn find-toggle${find.caseSensitive ? ' is-on' : ''}`}
        aria-pressed={find.caseSensitive}
        title="Match case"
        onClick={find.toggleCase}
      >
        Aa
      </button>

      <span className="find-count mono">
        {find.query === ''
          ? ''
          : find.total === 0
            ? 'No results'
            : `${find.active + 1} of ${find.total}`}
      </span>

      <button
        type="button"
        className="btn btn-icon find-step"
        aria-label="Previous match"
        disabled={find.total === 0}
        onClick={() => find.step(-1)}
      >
        ↑
      </button>
      <button
        type="button"
        className="btn btn-icon find-step"
        aria-label="Next match"
        disabled={find.total === 0}
        onClick={() => find.step(1)}
      >
        ↓
      </button>
      <button
        type="button"
        className="btn btn-icon find-step"
        aria-label="Close find"
        onClick={find.close}
      >
        ×
      </button>
    </div>
  );
}
