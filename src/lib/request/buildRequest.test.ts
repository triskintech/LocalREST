import { describe, expect, it } from 'vitest';
import { buildRequest } from './buildRequest';
import { emptyAuth, emptyBody, newRequest, type ApiRequest } from '../types';

const kv = (key: string, value: string, enabled = true) => ({
  id: `${key}-${value}`,
  key,
  value,
  enabled,
});

function make(overrides: Partial<ApiRequest> = {}): ApiRequest {
  return newRequest('r1', { url: 'https://api.test/items', ...overrides });
}

describe('buildRequest — url', () => {
  it('keeps a url with no params unchanged', () => {
    expect(buildRequest(make(), {}).url).toBe('https://api.test/items');
  });

  it('appends enabled params', () => {
    const built = buildRequest(make({ params: [kv('page', '2')] }), {});
    expect(built.url).toBe('https://api.test/items?page=2');
  });

  it('merges params into a url that already carries a query string', () => {
    const built = buildRequest(
      make({ url: 'https://api.test/items?sort=asc', params: [kv('page', '2')] }),
      {},
    );
    expect(built.url).toBe('https://api.test/items?sort=asc&page=2');
  });

  it('skips disabled and unnamed params', () => {
    const built = buildRequest(
      make({ params: [kv('a', '1', false), kv('', 'orphan'), kv('b', '2')] }),
      {},
    );
    expect(built.url).toBe('https://api.test/items?b=2');
  });

  it('percent-encodes param values', () => {
    const built = buildRequest(make({ params: [kv('q', 'a b&c')] }), {});
    expect(built.url).toBe('https://api.test/items?q=a%20b%26c');
  });

  it('replaces a query already in the url rather than duplicating it', () => {
    // The query lives in the URL bar and the Params table at once; params win.
    const built = buildRequest(
      make({ url: 'https://api.test/items?page=1&limit=25', params: [kv('page', '1'), kv('limit', '25')] }),
      {},
    );
    expect(built.url).toBe('https://api.test/items?page=1&limit=25');
  });

  it('lets an edited param override the value sitting in the url', () => {
    const built = buildRequest(
      make({ url: 'https://api.test/items?page=1', params: [kv('page', '9')] }),
      {},
    );
    expect(built.url).toBe('https://api.test/items?page=9');
  });

  it('removes a query key whose param row was unticked', () => {
    const built = buildRequest(
      make({ url: 'https://api.test/items?page=1&keep=yes', params: [kv('page', '1', false)] }),
      {},
    );
    expect(built.url).toBe('https://api.test/items?keep=yes');
  });

  it('leaves a query key the params say nothing about', () => {
    const built = buildRequest(
      make({ url: 'https://api.test/items?trace=abc', params: [kv('page', '2')] }),
      {},
    );
    expect(built.url).toBe('https://api.test/items?trace=abc&page=2');
  });

  it('keeps repeated keys when several rows share a name', () => {
    const built = buildRequest(
      make({ url: 'https://api.test/items', params: [kv('tag', 'a'), kv('tag', 'b')] }),
      {},
    );
    expect(built.url).toBe('https://api.test/items?tag=a&tag=b');
  });

  it('assumes https when no scheme is given', () => {
    expect(buildRequest(make({ url: 'api.test/items' }), {}).url).toBe('https://api.test/items');
  });

  it('preserves an http scheme', () => {
    expect(buildRequest(make({ url: 'http://localhost:8787/x' }), {}).url).toBe(
      'http://localhost:8787/x',
    );
  });

  it('reports an unusable url rather than throwing', () => {
    const built = buildRequest(make({ url: 'http://' }), {});
    expect(built.error).toBeTruthy();
  });

  it('reports an empty url', () => {
    expect(buildRequest(make({ url: '   ' }), {}).error).toBeTruthy();
  });
});

describe('buildRequest — variables', () => {
  it('resolves variables in the url', () => {
    const built = buildRequest(make({ url: '{{base}}/items' }), { base: 'https://x.test' });
    expect(built.url).toBe('https://x.test/items');
  });

  it('resolves variables in headers, params, body and auth', () => {
    const built = buildRequest(
      make({
        method: 'POST',
        url: '{{base}}/items',
        params: [kv('tenant', '{{tenant}}')],
        headers: [kv('X-Trace', '{{trace}}')],
        body: { ...emptyBody(), mode: 'json', raw: '{"id":"{{id}}"}' },
        auth: { ...emptyAuth(), type: 'bearer', token: '{{token}}' },
      }),
      { base: 'https://x.test', tenant: 'acme', trace: 't1', id: '7', token: 'sekret' },
    );
    expect(built.url).toBe('https://x.test/items?tenant=acme');
    expect(built.headers['X-Trace']).toBe('t1');
    expect(built.headers['Authorization']).toBe('Bearer sekret');
    expect(built.body).toBe('{"id":"7"}');
  });

  it('collects every missing variable name once', () => {
    const built = buildRequest(
      make({ url: '{{base}}/x', headers: [kv('A', '{{base}}'), kv('B', '{{other}}')] }),
      {},
    );
    expect(built.missing).toEqual(['base', 'other']);
  });
});

describe('buildRequest — headers', () => {
  it('keeps enabled named headers', () => {
    const built = buildRequest(make({ headers: [kv('Accept', 'application/json')] }), {});
    expect(built.headers).toEqual({ Accept: 'application/json' });
  });

  it('drops disabled and unnamed headers', () => {
    const built = buildRequest(
      make({ headers: [kv('A', '1', false), kv('', '2'), kv('B', '3')] }),
      {},
    );
    expect(built.headers).toEqual({ B: '3' });
  });

  it('drops headers the browser refuses to send and reports them', () => {
    const built = buildRequest(
      make({ headers: [kv('Cookie', 'a=1'), kv('User-Agent', 'me'), kv('Accept', '*/*')] }),
      {},
    );
    expect(built.headers).toEqual({ Accept: '*/*' });
    expect(built.droppedHeaders).toEqual(['Cookie', 'User-Agent']);
  });

  it('drops sec- and proxy- prefixed headers, which the spec also forbids', () => {
    // Observed in practice: a hand-set sec-ch-ua reaches the server carrying
    // Chrome's value, not the user's, with no indication anything was replaced.
    const built = buildRequest(
      make({
        headers: [kv('sec-ch-ua', '"Chromium";v="130"'), kv('Proxy-Auth', 'x'), kv('X-Ok', '1')],
      }),
      {},
    );
    expect(built.headers).toEqual({ 'X-Ok': '1' });
    expect(built.droppedHeaders).toEqual(['sec-ch-ua', 'Proxy-Auth']);
  });

  it('does not mistake a header merely containing "sec" for a forbidden one', () => {
    const built = buildRequest(make({ headers: [kv('X-Secret', 'shh')] }), {});
    expect(built.headers).toEqual({ 'X-Secret': 'shh' });
  });
});

describe('buildRequest — auth', () => {
  it('applies a bearer token', () => {
    const built = buildRequest(
      make({ auth: { ...emptyAuth(), type: 'bearer', token: 'abc' } }),
      {},
    );
    expect(built.headers['Authorization']).toBe('Bearer abc');
  });

  it('omits a bearer header when the token is blank', () => {
    const built = buildRequest(make({ auth: { ...emptyAuth(), type: 'bearer', token: '' } }), {});
    expect(built.headers['Authorization']).toBeUndefined();
  });

  it('base64-encodes basic auth', () => {
    const built = buildRequest(
      make({ auth: { ...emptyAuth(), type: 'basic', username: 'ada', password: 'pw' } }),
      {},
    );
    expect(built.headers['Authorization']).toBe(`Basic ${btoa('ada:pw')}`);
  });

  it('encodes non-latin1 basic credentials as utf-8', () => {
    const built = buildRequest(
      make({ auth: { ...emptyAuth(), type: 'basic', username: 'zoë', password: 'pw' } }),
      {},
    );
    // Naive btoa() throws on this input; the header must still be produced.
    expect(built.headers['Authorization']).toMatch(/^Basic /);
  });

  it('sends an api key as a header', () => {
    const built = buildRequest(
      make({ auth: { ...emptyAuth(), type: 'apikey', key: 'X-Key', value: 'k1' } }),
      {},
    );
    expect(built.headers['X-Key']).toBe('k1');
  });

  it('sends an api key as a query param', () => {
    const built = buildRequest(
      make({
        auth: { ...emptyAuth(), type: 'apikey', key: 'access_token', value: 'k1', apiKeyIn: 'query' },
      }),
      {},
    );
    expect(built.url).toBe('https://api.test/items?access_token=k1');
  });

  it('lets the auth tab win over a hand-typed Authorization header', () => {
    const built = buildRequest(
      make({
        headers: [kv('Authorization', 'Bearer stale')],
        auth: { ...emptyAuth(), type: 'bearer', token: 'fresh' },
      }),
      {},
    );
    expect(built.headers['Authorization']).toBe('Bearer fresh');
  });
});

describe('buildRequest — body', () => {
  it('sends no body for GET', () => {
    const built = buildRequest(
      make({ method: 'GET', body: { ...emptyBody(), mode: 'json', raw: '{}' } }),
      {},
    );
    expect(built.body).toBeUndefined();
  });

  it('sends no body for HEAD', () => {
    const built = buildRequest(
      make({ method: 'HEAD', body: { ...emptyBody(), mode: 'json', raw: '{}' } }),
      {},
    );
    expect(built.body).toBeUndefined();
  });

  it('defaults the content type for json', () => {
    const built = buildRequest(
      make({ method: 'POST', body: { ...emptyBody(), mode: 'json', raw: '{"a":1}' } }),
      {},
    );
    expect(built.headers['Content-Type']).toBe('application/json');
    expect(built.body).toBe('{"a":1}');
  });

  it('respects an explicit content type', () => {
    const built = buildRequest(
      make({
        method: 'POST',
        headers: [kv('content-type', 'application/vnd.api+json')],
        body: { ...emptyBody(), mode: 'json', raw: '{}' },
      }),
      {},
    );
    expect(built.headers['content-type']).toBe('application/vnd.api+json');
    expect(built.headers['Content-Type']).toBeUndefined();
  });

  it('encodes an urlencoded body and sets its content type', () => {
    const built = buildRequest(
      make({
        method: 'POST',
        body: {
          ...emptyBody(),
          mode: 'x-www-form-urlencoded',
          urlencoded: [kv('a', '1'), kv('b', 'x y'), kv('c', '3', false)],
        },
      }),
      {},
    );
    expect(built.body).toBe('a=1&b=x+y');
    expect(built.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
  });

  it('never sets a content type for form-data, so the boundary survives', () => {
    const built = buildRequest(
      make({
        method: 'POST',
        body: {
          ...emptyBody(),
          mode: 'form-data',
          formData: [{ ...kv('field', 'value'), kind: 'text' as const }],
        },
      }),
      {},
    );
    expect(built.headers['Content-Type']).toBeUndefined();
    expect(built.body).toBeInstanceOf(FormData);
  });

  it('sends no body in none mode', () => {
    const built = buildRequest(make({ method: 'POST' }), {});
    expect(built.body).toBeUndefined();
  });
});

// ── header casing ───────────────────────────────────────────────────────────
// HTTP header names are case-insensitive; these all used to survive as two
// spellings, which new Headers() folds into one comma-joined value.
describe('buildRequest — header casing', () => {

  it('drops a lower-case content-type before sending form-data', () => {
    // Left in place, the multipart body goes out declaring a content-type with
    // no boundary= and the server cannot parse a single field.
    const built = buildRequest(
      newRequest('r', {
        method: 'POST',
        url: 'https://x.test/u',
        headers: [kv('content-type', 'multipart/form-data')],
        body: {
          ...emptyBody(),
          mode: 'form-data',
          formData: [{ ...kv('a', 'b'), kind: 'text' as const }],
        },
      }),
      {},
    );
    expect(Object.keys(built.headers)).toEqual([]);
  });

  it('lets bearer auth replace a hand-typed lower-case authorization', () => {
    const built = buildRequest(
      newRequest('r', {
        url: 'https://x.test/u',
        headers: [kv('authorization', 'Bearer stale')],
        auth: { ...emptyAuth(), type: 'bearer', token: 'fresh' },
      }),
      {},
    );
    expect(Object.values(built.headers)).toEqual(['Bearer fresh']);
    expect([...new Headers(built.headers).entries()]).toEqual([
      ['authorization', 'Bearer fresh'],
    ]);
  });

  it('lets basic auth replace a hand-typed lower-case authorization', () => {
    const built = buildRequest(
      newRequest('r', {
        url: 'https://x.test/u',
        headers: [kv('AUTHORIZATION', 'Bearer stale')],
        auth: { ...emptyAuth(), type: 'basic', username: 'u', password: 'p' },
      }),
      {},
    );
    expect(Object.values(built.headers)).toHaveLength(1);
    expect(Object.values(built.headers)[0]).toMatch(/^Basic /);
  });

  it('lets an api-key header replace a differently-cased row', () => {
    const built = buildRequest(
      newRequest('r', {
        url: 'https://x.test/u',
        headers: [kv('x-api-key', 'stale')],
        auth: { ...emptyAuth(), type: 'apikey', key: 'X-API-Key', value: 'fresh' },
      }),
      {},
    );
    expect(Object.values(built.headers)).toEqual(['fresh']);
  });
});

// ── form-data files ─────────────────────────────────────────────────────────
// Only the filename is persisted; the File itself lives in a session map keyed
// by field id. A reloaded request therefore has a file field with no file, and
// building it must neither throw nor invent an empty part.
describe('buildRequest — form-data files', () => {
  const fileField = (id: string, key: string, fileName: string) => ({
    id,
    key,
    value: '',
    enabled: true,
    kind: 'file' as const,
    fileName,
  });

  const formRequest = (formData: ReturnType<typeof fileField>[]) =>
    make({ method: 'POST', body: { ...emptyBody(), mode: 'form-data', formData } });

  it('attaches a file the session still holds', () => {
    const file = new File(['hi'], 'note.txt', { type: 'text/plain' });
    const built = buildRequest(
      formRequest([fileField('f1', 'upload', 'note.txt')]),
      {},
      new Map([['f1', file]]),
    );
    const body = built.body as FormData;
    expect(body.get('upload')).toBeInstanceOf(File);
    expect((body.get('upload') as File).name).toBe('note.txt');
  });

  it('omits a file field whose file was lost to a reload rather than sending an empty part', () => {
    const built = buildRequest(formRequest([fileField('f1', 'upload', 'note.txt')]), {});
    expect([...(built.body as FormData).keys()]).toEqual([]);
  });

  it('resolves variables in a file field name', () => {
    const file = new File(['hi'], 'note.txt');
    const built = buildRequest(
      formRequest([fileField('f1', '{{field}}', 'note.txt')]),
      { field: 'upload' },
      new Map([['f1', file]]),
    );
    expect([...(built.body as FormData).keys()]).toEqual(['upload']);
  });
});

// An api key bound for the query used to be appended through url.searchParams,
// which re-serialises the entire query as form data on its way past — so
// switching auth on rewrote every other param's %20 into +.
describe('buildRequest — an api key in the query leaves the rest alone', () => {
  const withKey = (params: ReturnType<typeof kv>[]) =>
    buildRequest(
      make({
        params,
        auth: { ...emptyAuth(), type: 'apikey', key: 'token', value: 'k1', apiKeyIn: 'query' },
      }),
      {},
    );

  it('does not change how the other params are encoded', () => {
    const without = buildRequest(make({ params: [kv('q', 'a b'), kv('note', 'x,y')] }), {});
    expect(withKey([kv('q', 'a b'), kv('note', 'x,y')]).url).toBe(
      `${without.url}&token=k1`,
    );
  });

  it('appends the key after the params', () => {
    expect(withKey([kv('page', '2')]).url).toBe('https://api.test/items?page=2&token=k1');
  });

  it('leaves a pasted query byte-identical', () => {
    const built = buildRequest(
      make({
        url: 'https://api.test/items?sig=ab+cd',
        auth: { ...emptyAuth(), type: 'apikey', key: 'token', value: 'k1', apiKeyIn: 'query' },
      }),
      {},
    );
    expect(built.url).toBe('https://api.test/items?sig=ab+cd&token=k1');
  });

  it('resolves variables in the key and value', () => {
    const built = buildRequest(
      make({
        auth: { ...emptyAuth(), type: 'apikey', key: '{{k}}', value: '{{v}}', apiKeyIn: 'query' },
      }),
      { k: 'token', v: 'secret' },
    );
    expect(built.url).toBe('https://api.test/items?token=secret');
  });

  it('still sends nothing when the key is blank', () => {
    const built = buildRequest(
      make({ auth: { ...emptyAuth(), type: 'apikey', key: '  ', value: 'k1', apiKeyIn: 'query' } }),
      {},
    );
    expect(built.url).toBe('https://api.test/items');
  });
});
