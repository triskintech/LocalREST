import { describe, expect, it } from 'vitest';
import { findMatches, rangesByRow, sliceSegment } from './search';

const lines = ['{', '  "awb_numbers": [', '    "SF1798763371K00",', '    "SF1798763372K00"', ']'];

describe('findMatches', () => {
  it('finds nothing for an empty query', () => {
    expect(findMatches(lines, '')).toEqual([]);
  });

  it('finds a single occurrence', () => {
    expect(findMatches(lines, 'awb_numbers')).toEqual([{ row: 1, start: 3, end: 14 }]);
  });

  it('finds one hit per line across lines', () => {
    expect(findMatches(lines, 'SF17987633').map((m) => m.row)).toEqual([2, 3]);
  });

  it('finds several hits on the same line', () => {
    expect(findMatches(['aXaXa'], 'a')).toEqual([
      { row: 0, start: 0, end: 1 },
      { row: 0, start: 2, end: 3 },
      { row: 0, start: 4, end: 5 },
    ]);
  });

  it('does not overlap matches', () => {
    // "aaaa" contains two non-overlapping "aa", not three.
    expect(findMatches(['aaaa'], 'aa')).toHaveLength(2);
  });

  it('ignores case by default', () => {
    expect(findMatches(['Hello World'], 'hello')).toHaveLength(1);
  });

  it('respects case when asked', () => {
    expect(findMatches(['Hello World'], 'hello', true)).toHaveLength(0);
    expect(findMatches(['Hello World'], 'Hello', true)).toHaveLength(1);
  });

  it('treats regex characters literally', () => {
    // A response body is full of these; treating them as syntax would surprise.
    expect(findMatches(['a.c', 'abc'], '.')).toEqual([{ row: 0, start: 1, end: 2 }]);
    expect(findMatches(['"data": {'], '": {')).toHaveLength(1);
  });

  it('returns matches in reading order', () => {
    const found = findMatches(['x', 'x', 'x'], 'x');
    expect(found.map((m) => m.row)).toEqual([0, 1, 2]);
  });
});

describe('sliceSegment', () => {
  const range = (start: number, end: number, index = 0) => ({ start, end, index });

  it('returns the whole segment when nothing matches', () => {
    expect(sliceSegment('hello', 0, [])).toEqual([{ text: 'hello', match: null }]);
  });

  it('splits around a match', () => {
    expect(sliceSegment('hello', 0, [range(1, 3)])).toEqual([
      { text: 'h', match: null },
      { text: 'el', match: 0 },
      { text: 'lo', match: null },
    ]);
  });

  it('handles a match at the very start and end', () => {
    expect(sliceSegment('abc', 0, [range(0, 3)])).toEqual([{ text: 'abc', match: 0 }]);
  });

  it('accounts for the segment offset', () => {
    // Segment "world" begins at offset 6 of "hello world".
    expect(sliceSegment('world', 6, [range(6, 11)])).toEqual([{ text: 'world', match: 0 }]);
  });

  it('ignores ranges that fall outside the segment', () => {
    expect(sliceSegment('world', 6, [range(0, 5)])).toEqual([{ text: 'world', match: null }]);
  });

  it('clips a range that starts before the segment', () => {
    // A match spanning a key and its value must stay highlighted in both spans.
    expect(sliceSegment('world', 6, [range(3, 8)])).toEqual([
      { text: 'wo', match: 0 },
      { text: 'rld', match: null },
    ]);
  });

  it('handles two matches in one segment', () => {
    expect(sliceSegment('a-a', 0, [range(0, 1, 0), range(2, 3, 1)])).toEqual([
      { text: 'a', match: 0 },
      { text: '-', match: null },
      { text: 'a', match: 1 },
    ]);
  });

  it('returns nothing for an empty segment', () => {
    expect(sliceSegment('', 0, [range(0, 1)])).toEqual([]);
  });

  it('reassembles into the original text', () => {
    const pieces = sliceSegment('hello world', 0, [range(0, 2, 0), range(6, 8, 1)]);
    expect(pieces.map((p) => p.text).join('')).toBe('hello world');
  });
});

describe('rangesByRow', () => {
  it('groups matches by line, keeping their overall index', () => {
    const grouped = rangesByRow(findMatches(['x', 'xx'], 'x'));
    expect(grouped.get(0)).toEqual([{ start: 0, end: 1, index: 0 }]);
    expect(grouped.get(1)).toEqual([
      { start: 0, end: 1, index: 1 },
      { start: 1, end: 2, index: 2 },
    ]);
  });

  it('omits lines with no matches', () => {
    expect(rangesByRow(findMatches(['a', 'b'], 'a')).has(1)).toBe(false);
  });
});
