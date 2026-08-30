import { describe, expect, it } from 'vitest';
import { parseCurl } from './parseCurl';
import { toCurl } from './toCurl';
import { emptyAuth, emptyBody, newRequest, type ApiRequest } from '../types';

const kv = (key: string, value: string, enabled = true) => ({
  id: `${key}:${value}`,
  key,
  value,
  enabled,
});

const make = (overrides: Partial<ApiRequest> = {}) =>
  newRequest('r1', { url: 'https://api.test/items', ...overrides });

describe('toCurl', () => {
  it('emits a bare GET', () => {
    expect(toCurl(make())).toBe("curl 'https://api.test/items'");
  });

  it('emits an explicit method for anything else', () => {
    expect(toCurl(make({ method: 'DELETE' }))).toContain('-X DELETE');
  });

  it('emits headers on continuation lines', () => {
    const out = toCurl(make({ headers: [kv('Accept', 'application/json')] }));
    expect(out).toContain("\\\n  -H 'Accept: application/json'");
  });

  it('skips disabled headers', () => {
    expect(toCurl(make({ headers: [kv('X-Off', '1', false)] }))).not.toContain('X-Off');
  });

  it('escapes single quotes in a value', () => {
    const out = toCurl(make({ headers: [kv('X-Note', "it's fine")] }));
    // Shell has no escape inside single quotes: close, add \', reopen.
    expect(out).toContain(`'X-Note: it'\\''s fine'`);
  });

  it('emits a json body with --data-raw', () => {
    const out = toCurl(
      make({ method: 'POST', body: { ...emptyBody(), mode: 'json', raw: '{"a":1}' } }),
    );
    expect(out).toContain(`--data-raw '{"a":1}'`);
  });

  it('emits basic auth with -u', () => {
    const out = toCurl(
      make({ auth: { ...emptyAuth(), type: 'basic', username: 'ada', password: 'pw' } }),
    );
    expect(out).toContain("-u 'ada:pw'");
  });

  it('emits a bearer token as a header', () => {
    const out = toCurl(make({ auth: { ...emptyAuth(), type: 'bearer', token: 'abc' } }));
    expect(out).toContain("-H 'Authorization: Bearer abc'");
  });

  it('folds enabled params into the url', () => {
    expect(toCurl(make({ params: [kv('page', '2')] }))).toContain(
      "'https://api.test/items?page=2'",
    );
  });

  it('emits urlencoded fields with --data-urlencode', () => {
    const out = toCurl(
      make({
        method: 'POST',
        body: { ...emptyBody(), mode: 'x-www-form-urlencoded', urlencoded: [kv('q', 'a b')] },
      }),
    );
    expect(out).toContain(`--data-urlencode 'q=a b'`);
  });

  it('emits form fields with -F', () => {
    const out = toCurl(
      make({
        method: 'POST',
        body: {
          ...emptyBody(),
          mode: 'form-data',
          formData: [{ ...kv('name', 'ada'), kind: 'text' as const }],
        },
      }),
    );
    expect(out).toContain(`-F 'name=ada'`);
  });
});

describe('toCurl → parseCurl round trip', () => {
  const roundTrip = (request: ApiRequest) => parseCurl(toCurl(request));

  it('preserves a GET with headers', () => {
    const original = make({ headers: [kv('Accept', 'application/json')] });
    const back = roundTrip(original);
    expect(back.method).toBe('GET');
    expect(back.url).toBe(original.url);
    expect(back.headers.map((h) => [h.key, h.value])).toEqual([['Accept', 'application/json']]);
  });

  it('preserves a POST with a json body', () => {
    const original = make({
      method: 'POST',
      headers: [kv('Content-Type', 'application/json')],
      body: { ...emptyBody(), mode: 'json', raw: '{"name":"ada","n":1}' },
    });
    const back = roundTrip(original);
    expect(back.method).toBe('POST');
    expect(back.body.mode).toBe('json');
    expect(back.body.raw).toBe('{"name":"ada","n":1}');
  });

  it('preserves basic auth', () => {
    const original = make({
      auth: { ...emptyAuth(), type: 'basic', username: 'ada', password: 'pw' },
    });
    const back = roundTrip(original);
    expect(back.auth.type).toBe('basic');
    expect(back.auth.username).toBe('ada');
    expect(back.auth.password).toBe('pw');
  });

  it('preserves a value containing a single quote', () => {
    const original = make({ headers: [kv('X-Note', "it's fine")] });
    expect(roundTrip(original).headers[0]?.value).toBe("it's fine");
  });

  it('preserves params as rows as well as in the url', () => {
    // toCurl folds params into the url because curl has no param flag;
    // parseCurl lists them back out as rows without removing them from the url.
    const back = roundTrip(make({ params: [kv('page', '2'), kv('q', 'a b')] }));
    expect(back.params.map((p) => [p.key, p.value])).toEqual([
      ['page', '2'],
      ['q', 'a b'],
    ]);
    expect(back.url).toContain('page=2');
  });
});

describe('toCurl — the query string', () => {
  it('does not double a query that lives in both the URL and the params', () => {
    // parseCurl deliberately keeps the query in both places, so append-style
    // folding doubled it on the very first round trip.
    const imported = parseCurl("curl 'https://x.test/api?page=2'");
    expect(toCurl(imported)).toBe("curl 'https://x.test/api?page=2'");
  });

  it('survives a full import → export → import round trip', () => {
    const once = parseCurl("curl 'https://x.test/api?page=2&sort=name'");
    const twice = parseCurl(toCurl(once));
    expect(twice.url).toBe(once.url);
    expect(twice.params.map((p) => [p.key, p.value])).toEqual(
      once.params.map((p) => [p.key, p.value]),
    );
  });

  it('leaves a {{variable}} template intact instead of lower-casing it', () => {
    // The old path prepended a scheme and let URL parsing lower-case the host,
    // rewriting {{baseUrl}} to {{baseurl}} — which matches no environment
    // variable, so the exported command resolved to nothing.
    const request = newRequest('r', {
      url: '{{baseUrl}}/orders',
      params: [kv('page', '2')],
    });
    expect(toCurl(request)).toContain('{{baseUrl}}/orders?page=2');
  });

  it('emits an api key bound for the query string', () => {
    // It was gated on apiKeyIn === 'header' with no else, so the copied
    // command 401'd with nothing to show why.
    const request = newRequest('r', {
      url: 'https://x.test/thing',
      auth: { ...emptyAuth(), type: 'apikey', key: 'api_key', value: 'k123', apiKeyIn: 'query' },
    });
    const command = toCurl(request);
    expect(command).toContain('api_key=k123');
    expect(command).not.toContain('-H');
  });

  it('still sends an api key bound for a header as a header', () => {
    const request = newRequest('r', {
      url: 'https://x.test/thing',
      auth: { ...emptyAuth(), type: 'apikey', key: 'X-Key', value: 'k123', apiKeyIn: 'header' },
    });
    expect(toCurl(request)).toContain("-H 'X-Key: k123'");
  });

  it('omits a disabled param', () => {
    const request = newRequest('r', {
      url: 'https://x.test/thing',
      params: [kv('keep', '1'), kv('drop', '2', false)],
    });
    const command = toCurl(request);
    expect(command).toContain('keep=1');
    expect(command).not.toContain('drop');
  });
});
