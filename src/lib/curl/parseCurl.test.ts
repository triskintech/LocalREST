import { describe, expect, it } from 'vitest';
import { requestLabel } from '../request/label';
import { looksLikeCurl, parseCurl } from './parseCurl';

describe('looksLikeCurl', () => {
  it('recognises a bare command', () => {
    expect(looksLikeCurl('curl https://api.test/items')).toBe(true);
  });

  it('recognises a command copied with its shell prompt', () => {
    expect(looksLikeCurl('$ curl https://api.test/items')).toBe(true);
  });

  it('recognises the word "curl" alone', () => {
    expect(looksLikeCurl('curl')).toBe(true);
  });

  it('does not treat a URL as a curl command', () => {
    expect(looksLikeCurl('https://api.test/items')).toBe(false);
  });

  it('does not match a hostname that merely starts with "curl"', () => {
    expect(looksLikeCurl('https://curl.example.com/items')).toBe(false);
    expect(looksLikeCurl('curl.example.com')).toBe(false);
  });

  it('ignores surrounding whitespace', () => {
    expect(looksLikeCurl('  curl https://api.test  ')).toBe(true);
  });
});

describe('parseCurl', () => {
  it('parses a bare url', () => {
    const request = parseCurl('curl https://api.test/items');
    expect(request.method).toBe('GET');
    expect(request.url).toBe('https://api.test/items');
  });

  it('reads the program name case-insensitively', () => {
    // Reported bug: a mis-cased "cURL" was read as the URL itself, silently
    // dropping the real one — which arrived second and found `url` already
    // (wrongly) set.
    // The shape is what mattered in the report: mis-cased program name, a
    // quoted URL carrying a trailing empty query value, and a flag after it.
    const request = parseCurl(
      'cURL -X GET -H "content-length: 0" ' +
        '"https://api.test/shipments/scan_receive/?shipment_code=SF1234567890&lor_number=" ' +
        '-L',
    );
    expect(request.method).toBe('GET');
    expect(request.url).toBe(
      'https://api.test/shipments/scan_receive/?shipment_code=SF1234567890&lor_number=',
    );
    expect(request.headers).toEqual([
      expect.objectContaining({ key: 'content-length', value: '0' }),
    ]);
  });

  it('parses an explicit method', () => {
    expect(parseCurl('curl -X DELETE https://api.test/items/1').method).toBe('DELETE');
    expect(parseCurl('curl --request PUT https://api.test/x').method).toBe('PUT');
  });

  it('infers POST when data is present without an explicit method', () => {
    expect(parseCurl(`curl https://api.test/x -d '{"a":1}'`).method).toBe('POST');
  });

  it('lets an explicit method win over the inferred one', () => {
    expect(parseCurl(`curl -X PATCH https://api.test/x -d 'a=1'`).method).toBe('PATCH');
  });

  it('parses headers', () => {
    const request = parseCurl(
      `curl https://api.test/x -H 'Accept: application/json' -H "X-Trace: abc"`,
    );
    expect(request.headers.map((h) => [h.key, h.value])).toEqual([
      ['Accept', 'application/json'],
      ['X-Trace', 'abc'],
    ]);
  });

  it('keeps a header value containing a colon intact', () => {
    const request = parseCurl(`curl https://api.test/x -H 'Referer: https://a.test/b'`);
    expect(request.headers[0]?.value).toBe('https://a.test/b');
  });

  it('treats a json body as json', () => {
    const request = parseCurl(`curl -X POST https://api.test/x -d '{"name":"ada"}'`);
    expect(request.body.mode).toBe('json');
    expect(request.body.raw).toBe('{"name":"ada"}');
  });

  it('treats a non-json body as text', () => {
    const request = parseCurl(`curl -X POST https://api.test/x -d 'plain body'`);
    expect(request.body.mode).toBe('text');
  });

  it('reads --data-raw and --data-binary', () => {
    expect(parseCurl(`curl https://api.test/x --data-raw '{"a":1}'`).body.raw).toBe('{"a":1}');
    expect(parseCurl(`curl https://api.test/x --data-binary 'xy'`).body.raw).toBe('xy');
  });

  it('joins repeated data flags with &, as curl does', () => {
    const request = parseCurl(`curl https://api.test/x -d 'a=1' -d 'b=2'`);
    expect(request.body.raw).toBe('a=1&b=2');
  });

  it('parses basic auth from -u', () => {
    const request = parseCurl(`curl -u ada:pw https://api.test/x`);
    expect(request.auth.type).toBe('basic');
    expect(request.auth.username).toBe('ada');
    expect(request.auth.password).toBe('pw');
  });

  it('handles a password containing a colon', () => {
    const request = parseCurl(`curl -u 'ada:pw:extra' https://api.test/x`);
    expect(request.auth.password).toBe('pw:extra');
  });

  it('reads --url', () => {
    expect(parseCurl(`curl --url https://api.test/x`).url).toBe('https://api.test/x');
  });

  it('follows backslash line continuations', () => {
    const request = parseCurl(`curl 'https://api.test/x' \\
  -H 'Accept: application/json' \\
  -d '{"a":1}'`);
    expect(request.url).toBe('https://api.test/x');
    expect(request.headers).toHaveLength(1);
    expect(request.body.raw).toBe('{"a":1}');
  });

  it('ignores noise flags', () => {
    const request = parseCurl(
      `curl -L --location -i -s --silent --compressed -k https://api.test/x`,
    );
    expect(request.url).toBe('https://api.test/x');
    expect(request.method).toBe('GET');
  });

  it('splits combined short flags', () => {
    const request = parseCurl(`curl -sX POST https://api.test/x`);
    expect(request.method).toBe('POST');
    expect(request.url).toBe('https://api.test/x');
  });

  it('parses -F form fields', () => {
    const request = parseCurl(`curl -F 'name=ada' -F 'role=eng' https://api.test/x`);
    expect(request.body.mode).toBe('form-data');
    expect(request.body.formData.map((f) => [f.key, f.value])).toEqual([
      ['name', 'ada'],
      ['role', 'eng'],
    ]);
    expect(request.method).toBe('POST');
  });

  it('marks an -F file field as a file', () => {
    const request = parseCurl(`curl -F 'avatar=@/tmp/a.png' https://api.test/x`);
    expect(request.body.formData[0]?.kind).toBe('file');
    expect(request.body.formData[0]?.fileName).toBe('a.png');
  });

  it('parses --data-urlencode into an urlencoded body', () => {
    const request = parseCurl(`curl --data-urlencode 'q=a b' https://api.test/x`);
    expect(request.body.mode).toBe('x-www-form-urlencoded');
    expect(request.body.urlencoded[0]).toMatchObject({ key: 'q', value: 'a b' });
  });

  it('turns -b into a Cookie header', () => {
    const request = parseCurl(`curl -b 'session=1' https://api.test/x`);
    expect(request.headers.find((h) => h.key === 'Cookie')?.value).toBe('session=1');
  });

  it('handles escaped quotes inside a double-quoted string', () => {
    const request = parseCurl(`curl https://api.test/x -d "{\\"a\\":1}"`);
    expect(request.body.raw).toBe('{"a":1}');
  });

  it("handles $'...' ANSI-C quoting", () => {
    const request = parseCurl(`curl https://api.test/x -H $'X-A: b\\tc'`);
    expect(request.headers[0]?.value).toBe('b\tc');
  });

  it('accepts a command with no leading curl token', () => {
    expect(parseCurl(`https://api.test/x -H 'A: b'`).url).toBe('https://api.test/x');
  });

  it('imports browser-only headers unticked so they do not break the request', () => {
    // Verified against a real API: `pragma` and `priority` each force a CORS
    // preflight the server rejects, so a curl that works in a terminal fails
    // in a browser with an error that says nothing about headers.
    const request = parseCurl(
      `curl 'https://api.test/x' -H 'pragma: no-cache' -H 'priority: u=1, i' -H 'authorization: Token abc' -H 'accept: application/json'`,
    );
    const byKey = Object.fromEntries(request.headers.map((h) => [h.key, h.enabled]));
    expect(byKey['pragma']).toBe(false);
    expect(byKey['priority']).toBe(false);
    expect(byKey['authorization']).toBe(true);
    expect(byKey['accept']).toBe(true);
  });

  it('keeps accept-language enabled, since it is CORS-safelisted', () => {
    const request = parseCurl(`curl https://api.test/x -H 'accept-language: en-GB'`);
    expect(request.headers[0]?.enabled).toBe(true);
  });

  it('still lists the browser-only headers rather than hiding them', () => {
    const request = parseCurl(`curl https://api.test/x -H 'pragma: no-cache'`);
    expect(request.headers.map((h) => h.key)).toEqual(['pragma']);
  });

  it('leaves an imported request unnamed, so its label follows the url', () => {
    // A name baked from the path at import time goes stale the moment the URL
    // is edited; the empty name renders as the live URL instead.
    const request = parseCurl('curl https://api.test/v1/items');
    expect(request.name).toBe('');
    expect(requestLabel(request)).toBe('https://api.test/v1/items');
    expect(requestLabel({ ...request, url: 'https://api.test/v1/orders' })).toBe(
      'https://api.test/v1/orders',
    );
  });

  it('lists the query as params while leaving it in the url', () => {
    // Both places on purpose: the command still reads as pasted, and the two
    // cannot drift because buildRequest rewrites the query from the params.
    const request = parseCurl(
      "curl 'https://api.test/trip/upcoming/trip_details/?page=1&limit=25'",
    );
    expect(request.url).toBe('https://api.test/trip/upcoming/trip_details/?page=1&limit=25');
    expect(request.params.map((p) => [p.key, p.value, p.enabled])).toEqual([
      ['page', '1', true],
      ['limit', '25', true],
    ]);
  });

  it('leaves a request with a query unnamed too', () => {
    expect(parseCurl('curl https://api.test/v1/items?page=2').name).toBe('');
  });

  // The highest-value case: this is what Chrome DevTools puts on the clipboard,
  // and where most pasted curl actually comes from.
  it('parses Chrome DevTools "Copy as cURL" output', () => {
    const devtools = `curl 'https://api.test/v1/search?q=hello' \\
  -H 'accept: application/json, text/plain, */*' \\
  -H 'accept-language: en-GB,en;q=0.9' \\
  -H 'content-type: application/json' \\
  -H $'cookie: sid=abc; theme=dark' \\
  -H 'sec-ch-ua: "Chromium";v="130", "Not?A_Brand";v="99"' \\
  --data-raw '{"query":"hello","page":1}' \\
  --compressed`;
    const request = parseCurl(devtools);

    expect(request.method).toBe('POST');
    expect(request.url).toBe('https://api.test/v1/search?q=hello');
    expect(request.params.map((p) => [p.key, p.value])).toEqual([['q', 'hello']]);
    expect(request.body.mode).toBe('json');
    expect(request.body.raw).toBe('{"query":"hello","page":1}');
    expect(request.headers.find((h) => h.key === 'content-type')?.value).toBe('application/json');
    // The sec-ch-ua value is full of quotes and must survive intact.
    expect(request.headers.find((h) => h.key === 'sec-ch-ua')?.value).toBe(
      '"Chromium";v="130", "Not?A_Brand";v="99"',
    );
    expect(request.headers.find((h) => h.key === 'cookie')?.value).toBe('sid=abc; theme=dark');
  });
});

describe('parseCurl — flags that used to eat the URL', () => {
  it('reads a combined -XPATCH without inventing flags from the value', () => {
    // -XPATCH expanded to -X PATCH -P -A TCH -T -C -H, so -A invented a
    // User-Agent of "TCH" and the trailing -H swallowed the URL.
    const r = parseCurl("curl -XPATCH https://api.test/thing -d '{}'");
    expect(r.method).toBe('PATCH');
    expect(r.url).toBe('https://api.test/thing');
    expect(r.headers.map((h) => h.key)).not.toContain('User-Agent');
  });

  it('still expands a genuine bundle of valueless flags', () => {
    const r = parseCurl('curl -sSL https://api.test/thing');
    expect(r.url).toBe('https://api.test/thing');
  });

  it('still reads a bundle whose last flag takes the value', () => {
    const r = parseCurl('curl -sX POST https://api.test/thing');
    expect(r.method).toBe('POST');
    expect(r.url).toBe('https://api.test/thing');
  });

  it("does not read an unknown flag's value as the URL", () => {
    // --retry 3 used to import with url === "3", dropping the real one.
    const r = parseCurl('curl --retry 3 https://api.test/thing');
    expect(r.url).toBe('https://api.test/thing');
  });

  it.each([
    ['curl --max-time 30 https://api.test/a', 'https://api.test/a'],
    ['curl --connect-timeout 5 localhost:8787/a', 'localhost:8787/a'],
    ['curl --resolve example.com:443:1.2.3.4 https://example.com/a', 'https://example.com/a'],
  ])('%s -> %s', (command, expected) => {
    expect(parseCurl(command).url).toBe(expected);
  });

  it('still consumes the value when the URL came first', () => {
    const r = parseCurl('curl https://api.test/thing --retry 3');
    expect(r.url).toBe('https://api.test/thing');
  });
});

// ── flag values that look like flags ────────────────────────────────────────
// Bundle expansion used to run over every token, values included, so a payload
// that happened to be a dash and some letters was shredded into flags.
describe('parseCurl — a value is data, not flags', () => {
  it('keeps a body that starts with a dash', () => {
    const request = parseCurl("curl -d '-abc' https://x.test/p");
    expect(request.body.raw).toBe('-abc');
    expect(request.url).toBe('https://x.test/p');
    expect(request.method).toBe('POST');
  });

  it('keeps a header value that looks like a bundle', () => {
    const request = parseCurl("curl -H 'X-Mode: -abc' https://x.test/p");
    expect(request.headers.map((h) => [h.key, h.value])).toEqual([['X-Mode', '-abc']]);
  });

  it('keeps a dashed value handed to a bundle ending in a value flag', () => {
    const request = parseCurl("curl -sd '-abc' https://x.test/p");
    expect(request.body.raw).toBe('-abc');
    expect(request.url).toBe('https://x.test/p');
  });

  it('still expands a genuine bundle that follows a flag value', () => {
    const request = parseCurl("curl -d 'a=1' -sk https://x.test/p");
    expect(request.body.raw).toBe('a=1');
    expect(request.url).toBe('https://x.test/p');
  });
});

describe('parseCurl — -G', () => {
  it('moves the data onto the query instead of into a body', () => {
    const request = parseCurl("curl -G -d 'a=1&b=2' https://x.test/p");
    expect(request.method).toBe('GET');
    expect(request.body.mode).toBe('none');
    expect(request.url).toBe('https://x.test/p?a=1&b=2');
    expect(request.params.map((p) => [p.key, p.value])).toEqual([
      ['a', '1'],
      ['b', '2'],
    ]);
  });

  it('accepts the long spelling and appends to a query the url already had', () => {
    const request = parseCurl("curl --get -d 'b=2' 'https://x.test/p?a=1'");
    expect(request.url).toBe('https://x.test/p?a=1&b=2');
  });

  it('encodes urlencoded fields into the query', () => {
    const request = parseCurl("curl -G --data-urlencode 'q=a b' https://x.test/p");
    expect(request.url).toBe('https://x.test/p?q=a%20b');
    expect(request.params.map((p) => [p.key, p.value])).toEqual([['q', 'a b']]);
  });

  it('lets an explicit method win, as curl does', () => {
    expect(parseCurl("curl -G -X HEAD -d 'a=1' https://x.test/p").method).toBe('HEAD');
  });

  it('leaves a command with no data alone', () => {
    const request = parseCurl('curl -G https://x.test/p');
    expect(request.url).toBe('https://x.test/p');
    expect(request.method).toBe('GET');
  });
});

describe('parseCurl — nameless --data-urlencode', () => {
  it('keeps content given with no name rather than importing an empty body', () => {
    const request = parseCurl("curl --data-urlencode 'raw payload' https://x.test/p");
    expect(request.body.mode).toBe('text');
    expect(request.body.raw).toBe('raw payload');
    expect(request.method).toBe('POST');
  });

  it('keeps the =content form too', () => {
    expect(parseCurl("curl --data-urlencode '=payload' https://x.test/p").body.raw).toBe(
      'payload',
    );
  });

  it('still prefers named fields when both are present', () => {
    const request = parseCurl("curl --data-urlencode 'a=1' https://x.test/p");
    expect(request.body.mode).toBe('x-www-form-urlencoded');
    expect(request.body.urlencoded.map((r) => [r.key, r.value])).toEqual([['a', '1']]);
  });
});
