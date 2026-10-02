import { describe, expect, it } from 'vitest';
import { exportPostman } from './exportCollection';
import { importPostman } from './importCollection';
import { emptyAuth, emptyBody, newRequest, type Collection } from '../types';

const kv = (key: string, value: string, enabled = true) => ({
  id: `${key}:${value}`,
  key,
  value,
  enabled,
});

const collection = (requests: Collection['requests']): Collection => ({
  id: 'c1',
  name: 'My API',
  expanded: true,
  requests,
});

describe('exportPostman → importPostman round trip', () => {
  it('preserves the collection name', () => {
    const back = importPostman(exportPostman(collection([])));
    expect(back.collection.name).toBe('My API');
  });

  it('preserves a GET with headers and params', () => {
    const original = newRequest('r1', {
      name: 'List items',
      method: 'GET',
      url: 'https://api.test/items',
      headers: [kv('Accept', 'application/json'), kv('X-Off', '1', false)],
      params: [kv('page', '2')],
    });

    const request = importPostman(exportPostman(collection([original]))).collection.requests[0];
    expect(request?.name).toBe('List items');
    expect(request?.method).toBe('GET');
    expect(request?.url).toBe('https://api.test/items');
    expect(request?.headers.map((h) => [h.key, h.value, h.enabled])).toEqual([
      ['Accept', 'application/json', true],
      ['X-Off', '1', false],
    ]);
    expect(request?.params.map((p) => [p.key, p.value])).toEqual([['page', '2']]);
  });

  it('preserves a json body', () => {
    const original = newRequest('r1', {
      method: 'POST',
      url: 'https://api.test/items',
      body: { ...emptyBody(), mode: 'json', raw: '{"a":1}' },
    });
    const request = importPostman(exportPostman(collection([original]))).collection.requests[0];
    expect(request?.body.mode).toBe('json');
    expect(request?.body.raw).toBe('{"a":1}');
  });

  it('preserves an urlencoded body', () => {
    const original = newRequest('r1', {
      method: 'POST',
      url: 'https://api.test/x',
      body: { ...emptyBody(), mode: 'x-www-form-urlencoded', urlencoded: [kv('a', '1')] },
    });
    const request = importPostman(exportPostman(collection([original]))).collection.requests[0];
    expect(request?.body.mode).toBe('x-www-form-urlencoded');
    expect(request?.body.urlencoded[0]).toMatchObject({ key: 'a', value: '1' });
  });

  it('preserves a form-data body including a file field', () => {
    const original = newRequest('r1', {
      method: 'POST',
      url: 'https://api.test/x',
      body: {
        ...emptyBody(),
        mode: 'form-data',
        formData: [
          { ...kv('name', 'ada'), kind: 'text' as const },
          { ...kv('avatar', ''), kind: 'file' as const, fileName: 'a.png' },
        ],
      },
    });
    const fields = importPostman(exportPostman(collection([original]))).collection.requests[0]
      ?.body.formData;
    expect(fields?.[0]).toMatchObject({ key: 'name', value: 'ada', kind: 'text' });
    expect(fields?.[1]).toMatchObject({ key: 'avatar', kind: 'file', fileName: 'a.png' });
  });

  it('preserves each auth type', () => {
    const cases = [
      { ...emptyAuth(), type: 'bearer' as const, token: 't1' },
      { ...emptyAuth(), type: 'basic' as const, username: 'ada', password: 'pw' },
      {
        ...emptyAuth(),
        type: 'apikey' as const,
        key: 'X-Key',
        value: 'k1',
        apiKeyIn: 'query' as const,
      },
    ];

    for (const auth of cases) {
      const original = newRequest('r1', { url: 'https://api.test/x', auth });
      const back = importPostman(exportPostman(collection([original]))).collection.requests[0];
      expect(back?.auth).toMatchObject(auth);
    }
  });

  it('omits the body for a GET', () => {
    const original = newRequest('r1', {
      method: 'GET',
      url: 'https://api.test/x',
      body: { ...emptyBody(), mode: 'json', raw: '{"a":1}' },
    });
    const exported = exportPostman(collection([original])) as {
      item: { request: Record<string, unknown> }[];
    };
    expect(exported.item[0]?.request['body']).toBeUndefined();
  });

  it('declares the v2.1 schema so Postman accepts the file', () => {
    const exported = exportPostman(collection([])) as { info: { schema: string } };
    expect(exported.info.schema).toContain('v2.1.0');
  });
});

/**
 * Postman reads `host` and `path`, not `raw`.
 *
 * An export carrying only `raw` loads into Postman with every URL blank, which
 * is what made the file look like a format it did not support. Each expectation
 * below was taken from `postman-collection`'s own `Url.parse`, so these are
 * Postman's rules rather than a guess at them — including the awkward ones: a
 * trailing slash leaves a final empty segment, and a lone `{{variable}}` host
 * is still split on dots.
 */
describe('exportPostman URL decomposition', () => {
  const urlOf = (url: string) => {
    const exported = exportPostman(collection([newRequest('r1', { url })])) as {
      item: { request: { url: Record<string, unknown> } }[];
    };
    return exported.item[0]!.request.url;
  };

  it.each([
    ['https://api.test/x', { protocol: 'https', host: ['api', 'test'], path: ['x'] }],
    ['{{baseUrl}}/users/{{owner}}/repos', { host: ['{{baseUrl}}'], path: ['users', '{{owner}}', 'repos'] }],
    ['http://localhost:3000/api/orders', { protocol: 'http', host: ['localhost'], port: '3000', path: ['api', 'orders'] }],
    ['api.github.com/rate_limit', { host: ['api', 'github', 'com'], path: ['rate_limit'] }],
    ['https://api.test', { protocol: 'https', host: ['api', 'test'] }],
    ['https://api.test/', { protocol: 'https', host: ['api', 'test'], path: [''] }],
    ['https://api.test/a/', { protocol: 'https', host: ['api', 'test'], path: ['a', ''] }],
    ['{{baseUrl}}', { host: ['{{baseUrl}}'] }],
  ])('%s', (url, expected) => {
    expect(urlOf(url)).toMatchObject({ raw: url, ...expected });
  });

  it('has no path key at all when there is no path', () => {
    expect(urlOf('https://api.test')).not.toHaveProperty('path');
  });

  it('keeps userinfo and the fragment out of the host', () => {
    expect(urlOf('https://user:pw@api.test:8443/a#frag')).toMatchObject({
      protocol: 'https',
      auth: { user: 'user', password: 'pw' },
      host: ['api', 'test'],
      port: '8443',
      path: ['a'],
      hash: 'frag',
    });
  });

  it('treats an @ after the first slash as part of the path', () => {
    expect(urlOf('https://api.test/users/@me')).toMatchObject({
      host: ['api', 'test'],
      path: ['users', '@me'],
    });
  });
});
