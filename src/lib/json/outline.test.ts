import { describe, expect, it } from 'vitest';
import {
  foldableIndices,
  foldsContaining,
  outline,
  rowText,
  visibleRows,
} from './outline';

const render = (value: unknown) => outline(value).map(rowText).join('\n');

describe('outline', () => {
  // The strongest property available: if the rows do not reproduce
  // JSON.stringify exactly, the line numbers beside them are lying.
  const samples: [string, unknown][] = [
    ['scalar', 42],
    ['string', 'hello'],
    ['null', null],
    ['empty object', {}],
    ['empty array', []],
    ['flat object', { a: 1, b: 'two', c: true, d: null }],
    ['flat array', [1, 2, 3]],
    ['nested', { data: { awb_numbers: ['A', 'B'], count: 2 }, message: 'Success' }],
    ['array of objects', [{ a: 1 }, { b: [1, 2] }]],
    ['deep', { a: { b: { c: { d: [1, { e: 2 }] } } } }],
    ['keys needing escapes', { 'a"b': 1, 'c\\d': 2 }],
    ['empties inside', { list: [], obj: {}, after: 1 }],
  ];

  for (const [name, value] of samples) {
    it(`reproduces JSON.stringify for ${name}`, () => {
      expect(render(value)).toBe(JSON.stringify(value, null, 2));
    });
  }

  it('summarises an array by element count', () => {
    const rows = outline({ items: [1, 2, 3] });
    const opener = rows.find((row) => row.prefix.startsWith('"items"'));
    expect(opener?.fold?.summary).toBe('3 elements present');
    expect(opener?.fold?.close).toBe(']');
  });

  it('summarises an object by key count', () => {
    const rows = outline({ meta: { a: 1, b: 2 } });
    const opener = rows.find((row) => row.prefix.startsWith('"meta"'));
    expect(opener?.fold?.summary).toBe('2 keys present');
    expect(opener?.fold?.close).toBe('}');
  });

  it('uses the singular for one item', () => {
    expect(outline({ a: [1] })[1]?.fold?.summary).toBe('1 element present');
    expect(outline({ a: { b: 1 } })[1]?.fold?.summary).toBe('1 key present');
  });

  it('does not make an empty collection foldable', () => {
    expect(foldableIndices(outline({ a: [], b: {} }))).toEqual([0]);
  });

  it('reports the folds enclosing a row, innermost included', () => {
    const rows = outline({ a: { b: [1] } });
    const leaf = rows.findIndex((row) => row.text === '1');
    const enclosing = foldsContaining(rows, leaf);
    // The root object, "a"'s object and "b"'s array all enclose the leaf.
    expect(enclosing).toHaveLength(3);
    expect(enclosing).toContain(0);
  });

  it('reports no enclosing folds for the root row', () => {
    expect(foldsContaining(outline({ a: 1 }), 0)).toEqual([]);
  });

  it('does not count a fold that closes before the row', () => {
    const rows = outline({ a: [1], b: 2 });
    const after = rows.findIndex((row) => row.prefix.startsWith('"b"'));
    // Only the root encloses "b"; "a"'s array has already closed.
    expect(foldsContaining(rows, after)).toEqual([0]);
  });

  it('points each opener at its matching closer', () => {
    const rows = outline({ a: [1, 2] });
    const opener = rows[1];
    expect(opener?.text).toBe('[');
    expect(rows[opener?.fold?.closeIndex ?? -1]?.text).toBe(']');
  });

  it('keeps the trailing comma on the closing row', () => {
    const rows = outline({ a: [1], b: 2 });
    const closer = rows[rows.findIndex((r) => r.text === ']')];
    expect(closer?.comma).toBe(',');
  });

  it('tags each row with the kind of value it renders, for coloring', () => {
    const rows = outline({ s: 'hi', n: 1, b: true, z: null, list: [1], obj: {} });
    const kindOf = (prefix: string) => rows.find((r) => r.prefix.startsWith(prefix))?.kind;
    expect(kindOf('"s"')).toBe('string');
    expect(kindOf('"n"')).toBe('number');
    expect(kindOf('"b"')).toBe('boolean');
    expect(kindOf('"z"')).toBe('null');
    expect(kindOf('"list"')).toBe('punct');
    expect(kindOf('"obj"')).toBe('punct');
    expect(rows.find((r) => r.text === ']')?.kind).toBe('punct');
    expect(rows.find((r) => r.text === '1')?.kind).toBe('number');
  });
});

describe('visibleRows', () => {
  const rows = outline({ data: { list: [1, 2, 3] }, message: 'ok' });

  it('shows everything when nothing is folded', () => {
    expect(visibleRows(rows, new Set())).toHaveLength(rows.length);
  });

  it('hides a folded range but keeps the opener', () => {
    const dataOpener = rows.findIndex((row) => row.prefix.startsWith('"data"'));
    const visible = visibleRows(rows, new Set([dataOpener]));
    expect(visible).toContain(dataOpener);
    expect(visible).not.toContain(dataOpener + 1);
    // The line after "data"'s closing brace is still shown.
    const closeIndex = rows[dataOpener]?.fold?.closeIndex ?? -1;
    expect(visible).toContain(closeIndex + 1);
  });

  it('folding the root leaves a single row', () => {
    expect(visibleRows(rows, new Set([0]))).toEqual([0]);
  });

  it('a fold nested inside a folded range costs nothing extra', () => {
    const all = new Set(foldableIndices(rows));
    expect(visibleRows(rows, all)).toEqual([0]);
  });

  it('a row inside a folded range becomes visible once its ancestors open', () => {
    const nested = outline({ data: { list: [1, 2, 3] } });
    const deep = nested.findIndex((row) => row.text === '2');
    const enclosing = foldsContaining(nested, deep);

    expect(visibleRows(nested, new Set([0]))).not.toContain(deep);
    // Opening every enclosing fold is exactly what makes the hit reachable.
    const stillFolded = new Set(foldableIndices(nested).filter((i) => !enclosing.includes(i)));
    expect(visibleRows(nested, stillFolded)).toContain(deep);
  });

  it('line numbers stay original, so folding leaves gaps', () => {
    const dataOpener = rows.findIndex((row) => row.prefix.startsWith('"data"'));
    const visible = visibleRows(rows, new Set([dataOpener]));
    // Indices are not renumbered — they remain positions in the full outline.
    expect(visible).toEqual([...visible].sort((a, b) => a - b));
    expect(Math.max(...visible)).toBe(rows.length - 1);
  });
});
