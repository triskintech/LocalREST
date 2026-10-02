import { describe, expect, it } from 'vitest';
import { importPostman } from './importCollection';

const wrap = (items: unknown[], name = 'My API') => ({
  info: { name, schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
  item: items,
});

describe('importPostman', () => {
  it('reads the collection name', () => {
    const result = importPostman(wrap([]));
    expect(result.collection.name).toBe('My API');
  });

  it('imports a request with a raw url', () => {
    const result = importPostman(
      wrap([{ name: 'List items', request: { method: 'GET', url: 'https://api.test/items' } }]),
    );
    const request = result.collection.requests[0];
    expect(request?.name).toBe('List items');
    expect(request?.method).toBe('GET');
    expect(request?.url).toBe('https://api.test/items');
  });

  it('assembles a url given as an object', () => {
    const result = importPostman(
      wrap([
        {
          name: 'Get',
          request: {
            method: 'GET',
            url: { protocol: 'https', host: ['api', 'test'], path: ['v1', 'items'] },
          },
        },
      ]),
    );
    expect(result.collection.requests[0]?.url).toBe('https://api.test/v1/items');
  });

  it('prefers the raw form of a url object', () => {
    const result = importPostman(
      wrap([
        { name: 'Get', request: { url: { raw: 'https://api.test/raw', host: ['ignored'] } } },
      ]),
    );
    expect(result.collection.requests[0]?.url).toBe('https://api.test/raw');
  });

  it('imports the query array as params', () => {
    const result = importPostman(
      wrap([
        {
          name: 'Search',
          request: {
            url: {
              raw: 'https://api.test/search',
              query: [
                { key: 'q', value: 'hello' },
                { key: 'page', value: '2', disabled: true },
              ],
            },
          },
        },
      ]),
    );
    const params = result.collection.requests[0]?.params;
    expect(params?.map((p) => [p.key, p.value, p.enabled])).toEqual([
      ['q', 'hello', true],
      ['page', '2', false],
    ]);
  });

  it('imports headers and respects the disabled flag', () => {
    const result = importPostman(
      wrap([
        {
          name: 'H',
          request: {
            header: [
              { key: 'Accept', value: 'application/json' },
              { key: 'X-Off', value: '1', disabled: true },
            ],
          },
        },
      ]),
    );
    const headers = result.collection.requests[0]?.headers;
    expect(headers?.map((h) => [h.key, h.enabled])).toEqual([
      ['Accept', true],
      ['X-Off', false],
    ]);
  });

  it('flattens nested folders into the request name', () => {
    const result = importPostman(
      wrap([
        {
          name: 'Users',
          item: [
            { name: 'Admin', item: [{ name: 'Ban', request: { method: 'POST', url: 'u' } }] },
            { name: 'Get user', request: { method: 'GET', url: 'u' } },
          ],
        },
      ]),
    );
    expect(result.collection.requests.map((r) => r.name)).toEqual([
      'Users / Admin / Ban',
      'Users / Get user',
    ]);
  });

  it('imports a raw json body', () => {
    const result = importPostman(
      wrap([{ name: 'P', request: { method: 'POST', body: { mode: 'raw', raw: '{"a":1}' } } }]),
    );
    expect(result.collection.requests[0]?.body.mode).toBe('json');
    expect(result.collection.requests[0]?.body.raw).toBe('{"a":1}');
  });

  it('imports a raw non-json body as text', () => {
    const result = importPostman(
      wrap([{ name: 'P', request: { method: 'POST', body: { mode: 'raw', raw: 'hello' } } }]),
    );
    expect(result.collection.requests[0]?.body.mode).toBe('text');
  });

  it('imports an urlencoded body', () => {
    const result = importPostman(
      wrap([
        {
          name: 'P',
          request: {
            method: 'POST',
            body: { mode: 'urlencoded', urlencoded: [{ key: 'a', value: '1' }] },
          },
        },
      ]),
    );
    const body = result.collection.requests[0]?.body;
    expect(body?.mode).toBe('x-www-form-urlencoded');
    expect(body?.urlencoded[0]).toMatchObject({ key: 'a', value: '1' });
  });

  it('imports a formdata body including file fields', () => {
    const result = importPostman(
      wrap([
        {
          name: 'P',
          request: {
            method: 'POST',
            body: {
              mode: 'formdata',
              formdata: [
                { key: 'name', value: 'ada', type: 'text' },
                { key: 'avatar', src: '/tmp/a.png', type: 'file' },
              ],
            },
          },
        },
      ]),
    );
    const fields = result.collection.requests[0]?.body.formData;
    expect(fields?.[0]).toMatchObject({ key: 'name', value: 'ada', kind: 'text' });
    expect(fields?.[1]).toMatchObject({ key: 'avatar', kind: 'file', fileName: 'a.png' });
  });

  it('imports a bearer auth block', () => {
    const result = importPostman(
      wrap([
        {
          name: 'A',
          request: { auth: { type: 'bearer', bearer: [{ key: 'token', value: 't1' }] } },
        },
      ]),
    );
    expect(result.collection.requests[0]?.auth).toMatchObject({ type: 'bearer', token: 't1' });
  });

  it('imports a basic auth block', () => {
    const result = importPostman(
      wrap([
        {
          name: 'A',
          request: {
            auth: {
              type: 'basic',
              basic: [
                { key: 'username', value: 'ada' },
                { key: 'password', value: 'pw' },
              ],
            },
          },
        },
      ]),
    );
    expect(result.collection.requests[0]?.auth).toMatchObject({
      type: 'basic',
      username: 'ada',
      password: 'pw',
    });
  });

  it('imports an apikey auth block including its location', () => {
    const result = importPostman(
      wrap([
        {
          name: 'A',
          request: {
            auth: {
              type: 'apikey',
              apikey: [
                { key: 'key', value: 'X-Key' },
                { key: 'value', value: 'k1' },
                { key: 'in', value: 'query' },
              ],
            },
          },
        },
      ]),
    );
    expect(result.collection.requests[0]?.auth).toMatchObject({
      type: 'apikey',
      key: 'X-Key',
      value: 'k1',
      apiKeyIn: 'query',
    });
  });

  it('turns collection variables into an environment', () => {
    const result = importPostman({
      ...wrap([]),
      variable: [
        { key: 'baseUrl', value: 'https://api.test' },
        { key: 'token', value: 't1' },
      ],
    });
    expect(result.environment?.name).toBe('My API');
    expect(result.environment?.variables.map((v) => [v.key, v.value])).toEqual([
      ['baseUrl', 'https://api.test'],
      ['token', 't1'],
    ]);
  });

  it('produces no environment when there are no variables', () => {
    expect(importPostman(wrap([])).environment).toBeNull();
  });

  it('accepts a bare array of items', () => {
    const result = importPostman([{ name: 'X', request: { url: 'https://api.test/x' } }]);
    expect(result.collection.requests).toHaveLength(1);
    expect(result.collection.name).toBe('Imported collection');
  });

  it('lifts a query buried in a raw url into params', () => {
    const result = importPostman(
      wrap([{ name: 'S', request: { url: { raw: 'https://api.test/s?page=1&limit=25' } } }]),
    );
    const request = result.collection.requests[0];
    expect(request?.url).toBe('https://api.test/s');
    expect(request?.params.map((p) => [p.key, p.value])).toEqual([
      ['page', '1'],
      ['limit', '25'],
    ]);
  });

  it('does not duplicate params already described by the query array', () => {
    const result = importPostman(
      wrap([
        {
          name: 'S',
          request: {
            url: { raw: 'https://api.test/s?page=1', query: [{ key: 'page', value: '1' }] },
          },
        },
      ]),
    );
    const request = result.collection.requests[0];
    expect(request?.url).toBe('https://api.test/s');
    expect(request?.params.map((p) => [p.key, p.value])).toEqual([['page', '1']]);
  });

  it('leaves {{variables}} untouched, since the syntax is already ours', () => {
    const result = importPostman(
      wrap([{ name: 'V', request: { url: '{{baseUrl}}/items' } }]),
    );
    expect(result.collection.requests[0]?.url).toBe('{{baseUrl}}/items');
  });

  it('rejects something that is not a collection', () => {
    expect(() => importPostman({ hello: 'world' })).toThrow(/collection/i);
  });
});

/** Shapes a real Postman export contains that a hand-written one rarely does. */
describe('importPostman against what Postman actually writes', () => {
  const first = (source: unknown) => importPostman(source).collection.requests[0]!;

  it('does not invent a scheme for a {{variable}} host', () => {
    // https://{{baseUrl}} resolves to nothing, because baseUrl carries its own.
    const request = first(
      wrap([{ name: 'V', request: { url: { host: ['{{baseUrl}}'], path: ['items'] } } }]),
    );
    expect(request.url).toBe('{{baseUrl}}/items');
  });

  it('still supplies https for a real host given only in parts', () => {
    const request = first(
      wrap([{ name: 'H', request: { url: { host: ['api', 'test'], path: ['x'] } } }]),
    );
    expect(request.url).toBe('https://api.test/x');
  });

  it('believes the declared editor language over the leading character', () => {
    const request = first(
      wrap([
        {
          name: 'B',
          request: {
            method: 'POST',
            url: 'https://api.test/x',
            body: { mode: 'raw', raw: '{{payload}}', options: { raw: { language: 'json' } } },
          },
        },
      ]),
    );
    expect(request.body.mode).toBe('json');
  });

  it('reads a raw body declared as text, however it begins', () => {
    const request = first(
      wrap([
        {
          name: 'B',
          request: {
            method: 'POST',
            url: 'https://api.test/x',
            body: { mode: 'raw', raw: '{not json}', options: { raw: { language: 'text' } } },
          },
        },
      ]),
    );
    expect(request.body.mode).toBe('text');
  });

  it('imports a graphql body as the JSON it would actually send', () => {
    const request = first(
      wrap([
        {
          name: 'G',
          request: {
            method: 'POST',
            url: 'https://api.test/graphql',
            body: {
              mode: 'graphql',
              graphql: { query: '{ me { id } }', variables: '{"a":1}' },
            },
          },
        },
      ]),
    );
    expect(request.body.mode).toBe('json');
    expect(JSON.parse(request.body.raw)).toEqual({ query: '{ me { id } }', variables: { a: 1 } });
  });

  it('inherits auth from the collection', () => {
    const request = first({
      ...wrap([{ name: 'A', request: { url: 'https://api.test/x' } }]),
      auth: { type: 'bearer', bearer: [{ key: 'token', value: 'tkn' }] },
    });
    expect(request.auth).toMatchObject({ type: 'bearer', token: 'tkn' });
  });

  it('lets a request opt out of inherited auth with noauth', () => {
    const request = first({
      ...wrap([{ name: 'A', request: { url: 'https://api.test/x', auth: { type: 'noauth' } } }]),
      auth: { type: 'bearer', bearer: [{ key: 'token', value: 'tkn' }] },
    });
    expect(request.auth.type).toBe('none');
  });

  it('inherits auth through a folder', () => {
    const request = first({
      ...wrap([
        {
          name: 'Folder',
          auth: { type: 'basic', basic: [{ key: 'username', value: 'u' }, { key: 'password', value: 'p' }] },
          item: [{ name: 'A', request: { url: 'https://api.test/x' } }],
        },
      ]),
    });
    expect(request.auth).toMatchObject({ type: 'basic', username: 'u', password: 'p' });
  });

  it('reads headers given as one newline-delimited string', () => {
    const request = first(
      wrap([
        {
          name: 'H',
          request: {
            url: 'https://api.test/x',
            header: 'Accept: application/json\nX-Key: abc',
          },
        },
      ]),
    );
    expect(request.headers.map((h) => [h.key, h.value])).toEqual([
      ['Accept', 'application/json'],
      ['X-Key', 'abc'],
    ]);
  });
});
