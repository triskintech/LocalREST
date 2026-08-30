import { describe, expect, it } from 'vitest';
import { RawNumber, parseJson } from './parseJson';
import { outline, rowText } from './outline';

/** What the viewer actually renders for a body. */
const render = (text: string) => outline(parseJson(text)).map(rowText).join('\n');

describe('parseJson — agreement with JSON.parse', () => {
  const same = [
    '{}',
    '[]',
    'null',
    'true',
    'false',
    '0',
    '-0.5',
    '1000',
    '"plain"',
    '"quote \\" backslash \\\\ slash \\/"',
    '"escapes \\n\\t\\r\\b\\f"',
    '"unicode \\u00e9\\u0041"',
    '{"a":1,"b":[1,2,{"c":null}]}',
    '[[[]]]',
    '{"nested":{"deep":{"deeper":[true,false]}}}',
    '  {  "spaced" :  [ 1 , 2 ]  }  ',
    '{"empty":"","zero":0,"minus":-1}',
    '{"unicode":"héllo ☃"}',
    '{"dup":1,"dup":2}',
  ];

  for (const text of same) {
    it(`parses ${text.trim().slice(0, 40)} exactly as JSON.parse does`, () => {
      expect(parseJson(text)).toEqual(JSON.parse(text));
    });
  }

  it('keeps a "__proto__" key as a field rather than reaching the prototype', () => {
    const value = parseJson('{"__proto__":{"polluted":true}}') as Record<string, unknown>;
    expect(Object.keys(value)).toEqual(['__proto__']);
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });
});

describe('parseJson — malformed input', () => {
  const bad = [
    '',
    '{',
    '[1,]',
    '{"a":}',
    '{"a" 1}',
    "{'a':1}",
    '{"a":1}{"b":2}',
    'undefined',
    'NaN',
    '01',
    '.5',
    '"unterminated',
    '"raw \n newline"',
    '"\\x41"',
    '[1 2]',
  ];

  for (const text of bad) {
    it(`rejects ${JSON.stringify(text).slice(0, 30)} the way JSON.parse does`, () => {
      expect(() => JSON.parse(text)).toThrow();
      expect(() => parseJson(text)).toThrow(SyntaxError);
    });
  }
});

// ── the point of the exercise ───────────────────────────────────────────────
// JSON.parse maps every number onto a double, so a 64-bit id comes back as a
// different 64-bit id. The viewer showed it, find matched it, and "Save
// response" wrote it.
describe('parseJson — numbers a double cannot hold', () => {
  it('keeps the digits of an id too large for a double', () => {
    const value = parseJson('{"id":12345678901234567890}') as Record<string, unknown>;
    expect(value['id']).toBeInstanceOf(RawNumber);
    expect(String(value['id'])).toBe('12345678901234567890');
  });

  it('renders that id unchanged instead of rounding it', () => {
    expect(render('{"id":12345678901234567890}')).toBe('{\n  "id": 12345678901234567890\n}');
    // What the old path produced, for contrast.
    expect(JSON.stringify(JSON.parse('{"id":12345678901234567890}'), null, 2)).toContain(
      '12345678901234567000',
    );
  });

  it('does not turn an out-of-range number into null', () => {
    expect(render('{"big":1e999}')).toBe('{\n  "big": 1e999\n}');
  });

  it('keeps a high-precision decimal', () => {
    expect(render('[0.1234567890123456789]')).toBe('[\n  0.1234567890123456789\n]');
  });

  it('leaves ordinary numbers as plain numbers, so nothing else has to care', () => {
    const value = parseJson('{"n":42,"f":-1.5,"e":2000}') as Record<string, unknown>;
    expect(value).toEqual({ n: 42, f: -1.5, e: 2000 });
  });

  it('renders a body of ordinary values exactly as JSON.stringify would', () => {
    const text = '{"a":[1,2,3],"b":{"c":"d"},"e":null,"f":true}';
    expect(render(text)).toBe(JSON.stringify(JSON.parse(text), null, 2));
  });

  it('keeps a number spelled a way JSON.stringify would rewrite', () => {
    // Same value, different digits on the wire. Rendering the server's own
    // spelling costs nothing and never has to be explained.
    expect(render('{"e":2e3,"padded":1.50,"neg":-0}')).toBe(
      '{\n  "e": 2e3,\n  "padded": 1.50,\n  "neg": -0\n}',
    );
  });

  it('offers the lossy value to anyone who explicitly asks for it', () => {
    expect(Number(new RawNumber('1e999'))).toBe(Infinity);
    expect(new RawNumber('12').valueOf()).toBe(12);
  });
});
