import { newId } from '../ids';
import { splitQuery } from '../url';
import {
  METHODS,
  emptyAuth,
  emptyBody,
  newRequest,
  type ApiRequest,
  type Auth,
  type Body,
  type Collection,
  type Environment,
  type FormField,
  type KeyValue,
  type Method,
} from '../types';

export type PostmanImport = {
  collection: Collection;
  /** Built from the collection-level `variable` array, when present. */
  environment: Environment | null;
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const row = (key: string, value: string, disabled: unknown): KeyValue => ({
  id: newId(),
  key,
  value,
  enabled: disabled !== true,
});

/** Postman stores auth settings as `[{ key, value }]` rather than an object. */
function authValue(entries: unknown, key: string): string {
  for (const entry of arr(entries)) {
    if (isRecord(entry) && str(entry['key']) === key) return str(entry['value']);
  }
  return '';
}

function readAuth(raw: unknown): Auth {
  const auth = emptyAuth();
  if (!isRecord(raw)) return auth;

  switch (str(raw['type'])) {
    case 'bearer':
      auth.type = 'bearer';
      auth.token = authValue(raw['bearer'], 'token');
      return auth;
    case 'basic':
      auth.type = 'basic';
      auth.username = authValue(raw['basic'], 'username');
      auth.password = authValue(raw['basic'], 'password');
      return auth;
    case 'apikey':
      auth.type = 'apikey';
      auth.key = authValue(raw['apikey'], 'key');
      auth.value = authValue(raw['apikey'], 'value');
      auth.apiKeyIn = authValue(raw['apikey'], 'in') === 'query' ? 'query' : 'header';
      return auth;
    default:
      return auth;
  }
}

/** A url is either a string or an object; the object may or may not carry raw. */
function readUrl(raw: unknown): { url: string; params: KeyValue[] } {
  if (typeof raw === 'string') return { url: raw, params: [] };
  if (!isRecord(raw)) return { url: '', params: [] };

  const params = arr(raw['query'])
    .filter(isRecord)
    .map((q) => row(str(q['key']), str(q['value']), q['disabled']));

  const rawUrl = str(raw['raw']);
  if (rawUrl) {
    // Exports often carry the query only inside `raw`; lift it into params so
    // it is editable, unless a `query` array already described it.
    if (params.length > 0) return { url: splitQuery(rawUrl).url, params };
    return splitQuery(rawUrl);
  }

  const protocol = str(raw['protocol']) || 'https';
  const host = Array.isArray(raw['host']) ? raw['host'].map(str).join('.') : str(raw['host']);
  const path = Array.isArray(raw['path']) ? raw['path'].map(str).join('/') : str(raw['path']);
  if (!host) return { url: '', params };

  const port = str(raw['port']);
  const authority = port ? `${host}:${port}` : host;
  return { url: `${protocol}://${authority}${path ? `/${path}` : ''}`, params };
}

function readBody(raw: unknown): Body {
  const body = emptyBody();
  if (!isRecord(raw)) return body;

  switch (str(raw['mode'])) {
    case 'raw': {
      body.raw = str(raw['raw']);
      body.mode = /^\s*[[{]/.test(body.raw) ? 'json' : 'text';
      return body;
    }
    case 'urlencoded': {
      body.mode = 'x-www-form-urlencoded';
      body.urlencoded = arr(raw['urlencoded'])
        .filter(isRecord)
        .map((f) => row(str(f['key']), str(f['value']), f['disabled']));
      return body;
    }
    case 'formdata': {
      body.mode = 'form-data';
      body.formData = arr(raw['formdata'])
        .filter(isRecord)
        .map((f): FormField => {
          const base = row(str(f['key']), str(f['value']), f['disabled']);
          if (str(f['type']) !== 'file') return { ...base, kind: 'text' };
          const src = str(f['src']);
          return {
            ...base,
            value: '',
            kind: 'file',
            fileName: src.split('/').pop() || src,
          };
        });
      return body;
    }
    default:
      return body;
  }
}

function readMethod(raw: unknown): Method {
  const upper = str(raw).toUpperCase();
  return (METHODS as readonly string[]).includes(upper) ? (upper as Method) : 'GET';
}

/**
 * Walk the item tree, folding folder names into request names.
 *
 * Postman nests folders arbitrarily; this model is one level deep. Prefixing
 * the path keeps every bit of information while leaving the sidebar the
 * two-level tree the design calls for.
 */
function collectRequests(items: unknown[], prefix: string[], out: ApiRequest[]): void {
  for (const item of items) {
    if (!isRecord(item)) continue;
    const name = str(item['name']);

    if (Array.isArray(item['item'])) {
      collectRequests(item['item'], name ? [...prefix, name] : prefix, out);
      continue;
    }

    const raw = item['request'];
    if (raw === undefined) continue;
    // A request may be a bare url string in older exports.
    const request = isRecord(raw) ? raw : { url: str(raw) };

    const { url, params } = readUrl(request['url']);
    const headers = arr(request['header'])
      .filter(isRecord)
      .map((h) => row(str(h['key']), str(h['value']), h['disabled']));

    out.push(
      newRequest(newId(), {
        name: [...prefix, name || url || 'Request'].join(' / '),
        method: readMethod(request['method']),
        url,
        params,
        headers,
        body: readBody(request['body']),
        auth: readAuth(request['auth']),
      }),
    );
  }
}

/**
 * Import a Postman v2.0 or v2.1 collection. Also accepts a bare array of
 * items, which is what people paste when they copy part of an export.
 */
export function importPostman(source: unknown): PostmanImport {
  const isBareArray = Array.isArray(source);
  if (!isBareArray && !isRecord(source)) {
    throw new Error('That is not a Postman collection.');
  }

  const root = isBareArray ? {} : source;
  const items = isBareArray ? source : arr(root['item']);

  if (!isBareArray && !Array.isArray(root['item'])) {
    throw new Error('That JSON has no "item" list, so it is not a Postman collection.');
  }

  const info = isRecord(root['info']) ? root['info'] : {};
  const name = str(info['name']) || 'Imported collection';

  const requests: ApiRequest[] = [];
  collectRequests(items, [], requests);

  const variables = arr(root['variable'])
    .filter(isRecord)
    .map((v) => row(str(v['key']), str(v['value']), v['disabled']))
    .filter((v) => v.key !== '');

  return {
    collection: { id: newId(), name, expanded: true, requests },
    environment:
      variables.length > 0 ? { id: newId(), name, variables } : null,
  };
}
