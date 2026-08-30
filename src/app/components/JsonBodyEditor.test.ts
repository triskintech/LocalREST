import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { preparePlaceholder } from './JsonBodyEditor';

/**
 * `preparePlaceholder` reads a fold range straight from an EditorState — the
 * document, not the range object, is what carries the offsets, so building a
 * real (DOM-free) state is the honest way to exercise it.
 */
const rangeFor = (doc: string, from: number, to: number) => {
  const state = EditorState.create({ doc });
  return preparePlaceholder(state, { from, to });
};

describe('preparePlaceholder', () => {
  it('counts the keys in a flat object', () => {
    const doc = '{"a":1,"b":2,"c":3}';
    // Interior of the object, excluding the braces themselves.
    expect(rangeFor(doc, 1, doc.length - 1)).toEqual({ count: 3, isArray: false });
  });

  it('counts the elements in a flat array', () => {
    const doc = '[1,2,3,4]';
    expect(rangeFor(doc, 1, doc.length - 1)).toEqual({ count: 4, isArray: true });
  });

  it('does not count a comma nested inside a value', () => {
    // One key, whose object value happens to contain a comma of its own.
    const doc = '{"a":{"x":1,"y":2}}';
    expect(rangeFor(doc, 1, doc.length - 1)).toEqual({ count: 1, isArray: false });
  });

  it('does not count a comma inside a string value', () => {
    const doc = '{"a":"has, a comma","b":2}';
    expect(rangeFor(doc, 1, doc.length - 1)).toEqual({ count: 2, isArray: false });
  });

  it('is not confused by an escaped quote inside a string', () => {
    const doc = String.raw`{"a":"quote \" then, comma","b":2}`;
    expect(rangeFor(doc, 1, doc.length - 1)).toEqual({ count: 2, isArray: false });
  });

  it('reports zero for an empty range', () => {
    const doc = '{}';
    expect(rangeFor(doc, 1, 1)).toEqual({ count: 0, isArray: false });
  });

  it('reports a single item for one key or element', () => {
    expect(rangeFor('{"a":1}', 1, 6)).toEqual({ count: 1, isArray: false });
    expect(rangeFor('[1]', 1, 2)).toEqual({ count: 1, isArray: true });
  });
});
