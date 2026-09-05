import { describe, expect, it } from 'vitest';
import { applyParamsToUrl, splitQuery } from './url';
import { buildRequest } from './request/buildRequest';
import { newRequest } from './types';

const pairs = (params: { key: string; value: string }[]) =>
  params.map((p) => [p.key, p.value]);

describe('splitQuery', () => {
  it('leaves a url with no query alone', () => {
    const result = splitQuery('https://api.test/items');
    expect(result.url).toBe('https://api.test/items');
    expect(result.params).toEqual([]);
  });

  it('splits a single param', () => {
    const result = splitQuery('https://api.test/items?page=1');
    expect(result.url).toBe('https://api.test/items');
    expect(pairs(result.params)).toEqual([['page', '1']]);
  });

  it('splits several params', () => {
    const result = splitQuery('https://api.test/trip_details/?page=1&limit=25');
    expect(result.url).toBe('https://api.test/trip_details/');
    expect(pairs(result.params)).toEqual([
      ['page', '1'],
      ['limit', '25'],
    ]);
  });

  it('decodes percent-encoding and plus-as-space', () => {
    const result = splitQuery('https://api.test/s?q=a+b%26c');
    expect(pairs(result.params)).toEqual([['q', 'a b&c']]);
  });

  it('survives a malformed escape rather than throwing', () => {
    expect(pairs(splitQuery('https://api.test/s?q=100%').params)).toEqual([['q', '100%']]);
  });

  it('keeps a value containing = intact', () => {
    expect(pairs(splitQuery('https://api.test/s?token=a=b').params)).toEqual([
      ['token', 'a=b'],
    ]);
  });

  it('handles a key with no value', () => {
    expect(pairs(splitQuery('https://api.test/s?debug').params)).toEqual([['debug', '']]);
  });

  it('drops a trailing question mark', () => {
    const result = splitQuery('https://api.test/items?');
    expect(result.url).toBe('https://api.test/items');
    expect(result.params).toEqual([]);
  });

  it('splits a url that starts with a variable', () => {
    const result = splitQuery('{{baseUrl}}/items?page=2');
    expect(result.url).toBe('{{baseUrl}}/items');
    expect(pairs(result.params)).toEqual([['page', '2']]);
  });

  it('is lossless: sending the split request rebuilds the original url', () => {
    const original = 'https://api.test/trip_details/?page=1&limit=25';
    const { url, params } = splitQuery(original);
    const built = buildRequest(newRequest('r1', { url, params }), {});
    expect(built.url).toBe(original);
  });
});

describe('applyParamsToUrl', () => {
  const row = (key: string, value: string, enabled = true) => ({
    id: `${key}:${value}`,
    key,
    value,
    enabled,
  });

  it('appends params to a url with no query', () => {
    expect(applyParamsToUrl('https://api.test/x', [row('a', '1')])).toBe(
      'https://api.test/x?a=1',
    );
  });

  it('is idempotent when the url already carries the same query', () => {
    // The property that lets the query live in both places safely.
    const url = 'https://api.test/x?a=1&b=2';
    const params = [row('a', '1'), row('b', '2')];
    expect(applyParamsToUrl(url, params)).toBe(url);
    expect(applyParamsToUrl(applyParamsToUrl(url, params), params)).toBe(url);
  });

  it('overrides a value the url already had', () => {
    expect(applyParamsToUrl('https://api.test/x?a=1', [row('a', '9')])).toBe(
      'https://api.test/x?a=9',
    );
  });

  it('removes a key whose rows are all disabled', () => {
    expect(applyParamsToUrl('https://api.test/x?a=1&b=2', [row('a', '1', false)])).toBe(
      'https://api.test/x?b=2',
    );
  });

  it('leaves query keys the params never mention', () => {
    expect(applyParamsToUrl('https://api.test/x?keep=1', [row('a', '2')])).toBe(
      'https://api.test/x?keep=1&a=2',
    );
  });

  it('preserves the position of a key the url already had', () => {
    expect(
      applyParamsToUrl('https://api.test/x?a=1&keep=2', [row('a', '9'), row('z', '3')]),
    ).toBe('https://api.test/x?a=9&keep=2&z=3');
  });

  it('keeps repeated keys', () => {
    expect(applyParamsToUrl('https://api.test/x', [row('t', 'a'), row('t', 'b')])).toBe(
      'https://api.test/x?t=a&t=b',
    );
  });

  it('drops the query entirely when nothing is left', () => {
    expect(applyParamsToUrl('https://api.test/x?a=1', [row('a', '1', false)])).toBe(
      'https://api.test/x',
    );
  });

  it('ignores rows with no key', () => {
    expect(applyParamsToUrl('https://api.test/x', [row('', 'orphan')])).toBe('https://api.test/x');
  });

  it('encodes reserved characters', () => {
    expect(applyParamsToUrl('https://api.test/x', [row('q', 'a b&c')])).toBe(
      'https://api.test/x?q=a%20b%26c',
    );
  });
});

describe('url — fragments', () => {
  // A fragment is never sent to the server, so it must not be swept into the
  // query: ?a=1#section used to yield a param valued "1#section", which then
  // encoded to a=1%23section and travelled as a literal # — or vanished when a
  // param row of the same name replaced it.
  it('does not fold a fragment into the last param value', () => {
    const { url, params } = splitQuery('https://x.test/p?a=1#section');
    expect(params.map((p) => [p.key, p.value])).toEqual([['a', '1']]);
    expect(url).toBe('https://x.test/p#section');
  });

  it('keeps a fragment on a URL that has no query', () => {
    expect(splitQuery('https://x.test/p#section').url).toBe('https://x.test/p#section');
  });

  it('preserves the fragment when params are written back', () => {
    expect(
      applyParamsToUrl('https://x.test/p?a=1#section', [
        { id: 'a', key: 'a', value: '2', enabled: true },
      ]),
    ).toBe('https://x.test/p?a=2#section');
  });

  it('keeps the fragment when every param is stripped', () => {
    expect(
      applyParamsToUrl('https://x.test/p?a=1#section', [
        { id: 'a', key: 'a', value: '1', enabled: false },
      ]),
    ).toBe('https://x.test/p#section');
  });

  it('round-trips a fragment through split and apply', () => {
    const raw = 'https://x.test/p?a=1&b=2#top';
    const { url, params } = splitQuery(raw);
    expect(applyParamsToUrl(url, params)).toBe(raw);
  });
});

describe('url — repeated and empty keys', () => {
  it('keeps every occurrence of a repeated key as its own row', () => {
    const { params } = splitQuery('https://api.test/x?tag=a&tag=b');
    expect(pairs(params)).toEqual([
      ['tag', 'a'],
      ['tag', 'b'],
    ]);
  });

  it('rewrites every row of a repeated key together, in the original position', () => {
    expect(
      applyParamsToUrl('https://api.test/x?tag=a&keep=1', [
        { id: '1', key: 'tag', value: 'a', enabled: true },
        { id: '2', key: 'tag', value: 'b', enabled: true },
      ]),
    ).toBe('https://api.test/x?tag=a&tag=b&keep=1');
  });

  it('leaves a percent-escaped value byte-identical through a round trip', () => {
    const raw = 'https://api.test/x?path=%2Fa%2Fb&brace=%7Bid%7D';
    const { url, params } = splitQuery(raw);
    expect(applyParamsToUrl(url, params)).toBe(raw);
  });

  it('passes a keyless query entry through untouched rather than mangling it', () => {
    const raw = 'https://api.test/x?=v';
    const { params } = splitQuery(raw);
    expect(applyParamsToUrl(raw, params)).toBe(raw);
  });

  it('never invents a query entry from a row with no key', () => {
    expect(
      applyParamsToUrl('https://api.test/x', [{ id: '1', key: '  ', value: 'v', enabled: true }]),
    ).toBe('https://api.test/x');
  });
});

// ── encoding fidelity ───────────────────────────────────────────────────────
// Decoding a query and re-encoding it is not an identity: `+` decodes to a
// space and encodes back to %20. Since every send runs the URL through this,
// a pasted link carrying a literal + went out saying something else.
describe('url — a pasted query survives untouched', () => {
  it('leaves a base64 signature alone when there are no param rows', () => {
    const raw = 'https://bucket.test/o?X-Signature=ab+cd/ef==&expires=1700000000';
    expect(applyParamsToUrl(raw, [])).toBe(raw);
  });

  it('sends that url byte-for-byte', () => {
    const raw = 'https://bucket.test/o?X-Signature=ab+cd/ef==';
    expect(buildRequest(newRequest('r1', { url: raw }), {}).url).toBe(raw);
  });

  it('keeps the original spelling of a row nobody edited', () => {
    // The URL bar was blurred, so the query is listed as rows as well — the
    // URL still carries it, and the rows still say what it said.
    const raw = 'https://bucket.test/o?sig=ab+cd&page=1';
    const { params } = splitQuery(raw);
    expect(applyParamsToUrl(raw, params)).toBe(raw);
  });

  it('re-encodes only the value that actually changed', () => {
    const raw = 'https://bucket.test/o?sig=ab+cd&page=1';
    const { params } = splitQuery(raw);
    const edited = params.map((p) => (p.key === 'page' ? { ...p, value: '2' } : p));
    expect(applyParamsToUrl(raw, edited)).toBe('https://bucket.test/o?sig=ab+cd&page=2');
  });

  it('encodes canonically once the query lives only in the rows', () => {
    // Nothing left to copy from: an importer that lifted the query out of the
    // URL hands over decoded values, and %20 is the encoding for a space.
    const { url, params } = splitQuery('https://bucket.test/o?sig=ab+cd');
    expect(applyParamsToUrl(url, params)).toBe('https://bucket.test/o?sig=ab%20cd');
  });

  it('encodes a space typed into the params table as %20', () => {
    expect(
      applyParamsToUrl('https://api.test/x', [{ id: 'q', key: 'q', value: 'a b', enabled: true }]),
    ).toBe('https://api.test/x?q=a%20b');
  });

  it('preserves a key with no value rather than inventing an =', () => {
    const raw = 'https://api.test/x?debug&page=1';
    const { params } = splitQuery(raw);
    expect(applyParamsToUrl(raw, params)).toBe(raw);
  });
});

describe('applyParamsToUrl — ordering of repeated keys', () => {
  const rand = (seed: { s: number }) => {
    seed.s = (seed.s * 1103515245 + 12345) & 0x7fffffff;
    return seed.s / 0x7fffffff;
  };

  /**
   * Rows for the same key are emitted together at that key's first position.
   * Pinned because it is a real consequence of params owning a key rather than
   * a position: once the table can add and remove rows for `b`, an interleaved
   * `b=1&c=2&b=3` has no unambiguous place to put a third `b`. Distinct keys
   * keep their original order, which is what a server that cares about order
   * actually looks at.
   */
  it('groups a repeated key at its first occurrence', () => {
    const raw = 'https://api.test/x?b=1&c=2&b=3';
    const { params } = splitQuery(raw);
    expect(applyParamsToUrl(raw, params)).toBe('https://api.test/x?b=1&b=3&c=2');
  });

  it('leaves a URL alone when no key repeats', () => {
    const raw = 'https://api.test/x?a=1&b=2&c=3';
    const { params } = splitQuery(raw);
    expect(applyParamsToUrl(raw, params)).toBe(raw);
  });

  // The property that actually matters on the wire: nothing is invented, lost,
  // or re-encoded, and the order distinct keys first appear in is preserved.
  it('preserves every pair and the first-appearance order of keys, over 1000 random URLs', () => {
    const seed = { s: 24680 };
    const alphabet = ['a', 'b', 'x y', 'p+q', 'a/b', 'c=d', 'e&f', '%20', 'ü', '1'];
    const keyOrder = (query: string) => {
      const seen: string[] = [];
      for (const pair of query.split('&')) {
        const key = pair.slice(0, pair.indexOf('='));
        if (!seen.includes(key)) seen.push(key);
      }
      return seen;
    };

    for (let i = 0; i < 1000; i += 1) {
      const pairs = Array.from({ length: Math.floor(rand(seed) * 5) }, () => {
        const k = alphabet[Math.floor(rand(seed) * alphabet.length)] as string;
        const v = alphabet[Math.floor(rand(seed) * alphabet.length)] as string;
        return `${encodeURIComponent(k)}=${encodeURIComponent(v)}`;
      });
      if (pairs.length === 0) continue;

      const raw = `https://x.test/p?${pairs.join('&')}`;
      const { params } = splitQuery(raw);
      const out = applyParamsToUrl(raw, params);
      const query = out.slice(out.indexOf('?') + 1);

      // Copies, because sort() mutates and the order check below needs the
      // original sequence.
      expect([...query.split('&')].sort(), `case ${i}: ${raw}`).toEqual([...pairs].sort());
      expect(keyOrder(query), `case ${i}: ${raw}`).toEqual(keyOrder(pairs.join('&')));
    }
  });
});

/**
 * The params table owns a row's *identity*, not its spelling. Renaming a key
 * — which is what typing one into an empty row is, one character at a time —
 * used to leave every previous spelling behind in the URL as an orphan param,
 * because a renamed key is unowned and unowned keys are preserved on purpose.
 * Deleting a row had the same fault, and that one shipped a wrong request:
 * the param stayed in the URL and went out on the wire.
 */
describe('applyParamsToUrl — rows that were renamed or removed', () => {
  const row = (key: string, value: string, enabled = true) => ({
    id: `id:${key}`,
    key,
    value,
    enabled,
  });
  const stable = (key: string, value: string) => ({ id: 'row-1', key, value, enabled: true });

  it('leaves nothing behind while a key is typed one character at a time', () => {
    let url = 'https://api.test/x';
    let previous = [stable('', '')];
    for (const key of ['e', 'ex', 'exa', 'exam', 'example']) {
      const next = [stable(key, '')];
      url = applyParamsToUrl(url, next, previous);
      previous = next;
    }
    expect(url).toBe('https://api.test/x?example=');
  });

  it('drops a key the params no longer carry, so a deleted row is not sent', () => {
    const previous = [row('a', '1'), row('b', '2')];
    expect(applyParamsToUrl('https://api.test/x?a=1&b=2', [row('b', '2')], previous)).toBe(
      'https://api.test/x?b=2',
    );
  });

  it('still preserves a key only the url bar ever had', () => {
    const previous = [row('a', '1')];
    expect(applyParamsToUrl('https://api.test/x?keep=1&a=1', [row('a', '2')], previous)).toBe(
      'https://api.test/x?keep=1&a=2',
    );
  });

  it('preserves a url-only key across a rename of a different row', () => {
    const previous = [row('a', '1')];
    expect(applyParamsToUrl('https://api.test/x?keep=1&a=1', [row('z', '1')], previous)).toBe(
      'https://api.test/x?keep=1&z=1',
    );
  });

  it('keeps the surviving row when one of two rows sharing a key is deleted', () => {
    const previous = [
      { id: 'r1', key: 'tag', value: 'a', enabled: true },
      { id: 'r2', key: 'tag', value: 'b', enabled: true },
    ];
    expect(applyParamsToUrl('https://api.test/x?tag=a&tag=b', [previous[1]!], previous)).toBe(
      'https://api.test/x?tag=b',
    );
  });

  // Callers that legitimately have no previous set — buildRequest and toCurl
  // build a url from whatever they are handed — must keep the old behaviour.
  it('preserves unowned keys when no previous params are given', () => {
    expect(applyParamsToUrl('https://api.test/x?keep=1', [row('a', '2')])).toBe(
      'https://api.test/x?keep=1&a=2',
    );
  });
});
