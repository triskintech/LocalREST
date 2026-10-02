import { BODYLESS_METHODS, type ApiRequest, type Collection, type KeyValue } from '../types';

const POSTMAN_SCHEMA =
  'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';

const active = (rows: KeyValue[]) => rows.filter((row) => row.key.trim() !== '');

const asRows = (rows: KeyValue[]) =>
  active(rows).map((row) => ({
    key: row.key,
    value: row.value,
    ...(row.enabled ? {} : { disabled: true }),
  }));

function exportAuth(request: ApiRequest) {
  const { auth } = request;
  switch (auth.type) {
    case 'bearer':
      return { type: 'bearer', bearer: [{ key: 'token', value: auth.token, type: 'string' }] };
    case 'basic':
      return {
        type: 'basic',
        basic: [
          { key: 'username', value: auth.username, type: 'string' },
          { key: 'password', value: auth.password, type: 'string' },
        ],
      };
    case 'apikey':
      return {
        type: 'apikey',
        apikey: [
          { key: 'key', value: auth.key, type: 'string' },
          { key: 'value', value: auth.value, type: 'string' },
          { key: 'in', value: auth.apiKeyIn, type: 'string' },
        ],
      };
    default:
      return undefined;
  }
}

function exportBody(request: ApiRequest) {
  if (BODYLESS_METHODS.has(request.method)) return undefined;
  const { body } = request;

  switch (body.mode) {
    case 'json':
      return {
        mode: 'raw',
        raw: body.raw,
        options: { raw: { language: 'json' } },
      };
    case 'text':
      return { mode: 'raw', raw: body.raw };
    case 'x-www-form-urlencoded':
      return { mode: 'urlencoded', urlencoded: asRows(body.urlencoded) };
    case 'form-data':
      return {
        mode: 'formdata',
        formdata: body.formData
          .filter((field) => field.key.trim() !== '')
          .map((field) =>
            field.kind === 'file'
              ? { key: field.key, type: 'file', src: field.fileName ?? '' }
              : { key: field.key, type: 'text', value: field.value },
          ),
      };
    default:
      return undefined;
  }
}

/**
 * Take a URL apart the way Postman's own parser does.
 *
 * `raw` is a display value to Postman, not the source of truth: its SDK reads
 * `host` and `path`, and a collection carrying only `raw` imports with every
 * URL blank — which is why Postman rejected what this exporter used to write.
 * Each rule below mirrors a case checked against `postman-collection`'s
 * `Url.parse`, including the ones that look like mistakes: a trailing slash
 * really does produce a final empty path segment, and a host is split on dots
 * even when it is a single `{{variable}}`.
 */
function splitUrl(raw: string) {
  let rest = raw;

  let hash = '';
  const hashAt = rest.indexOf('#');
  if (hashAt !== -1) {
    hash = rest.slice(hashAt + 1);
    rest = rest.slice(0, hashAt);
  }

  const queryAt = rest.indexOf('?');
  if (queryAt !== -1) rest = rest.slice(0, queryAt);

  let protocol = '';
  const schemeAt = rest.indexOf('://');
  if (schemeAt !== -1) {
    protocol = rest.slice(0, schemeAt);
    rest = rest.slice(schemeAt + 3);
  }

  // Only an `@` before the first slash is userinfo; one later belongs to the path.
  let auth: { user: string; password: string } | undefined;
  const atAt = rest.indexOf('@');
  const slashAfterAuth = rest.indexOf('/');
  if (atAt !== -1 && (slashAfterAuth === -1 || atAt < slashAfterAuth)) {
    const [user = '', password = ''] = rest.slice(0, atAt).split(':');
    auth = { user, password };
    rest = rest.slice(atAt + 1);
  }

  const slashAt = rest.indexOf('/');
  const authority = slashAt === -1 ? rest : rest.slice(0, slashAt);
  const path = slashAt === -1 ? null : rest.slice(slashAt + 1);

  let host = authority;
  let port = '';
  const colonAt = authority.lastIndexOf(':');
  if (colonAt !== -1 && /^\d+$/.test(authority.slice(colonAt + 1))) {
    host = authority.slice(0, colonAt);
    port = authority.slice(colonAt + 1);
  }

  return { protocol, auth, host, port, path, hash };
}

/** The `url` object Postman writes: the parts, with `raw` alongside them. */
function exportUrl(request: ApiRequest) {
  const query = asRows(request.params);
  const parts = splitUrl(request.url);

  return {
    raw: request.url,
    ...(parts.protocol ? { protocol: parts.protocol } : {}),
    ...(parts.auth ? { auth: parts.auth } : {}),
    ...(parts.host ? { host: parts.host.split('.') } : {}),
    ...(parts.port ? { port: parts.port } : {}),
    ...(parts.path === null ? {} : { path: parts.path.split('/') }),
    ...(query.length > 0 ? { query } : {}),
    ...(parts.hash ? { hash: parts.hash } : {}),
  };
}

/**
 * Render a collection as Postman v2.1 JSON, the format Postman itself imports.
 * The shape mirrors what `importPostman` reads, so a round trip is lossless
 * for everything this app models.
 */
export function exportPostman(collection: Collection): unknown {
  return {
    info: {
      name: collection.name,
      schema: POSTMAN_SCHEMA,
      _postman_id: collection.id,
    },
    item: collection.requests.map((request) => {
      // Built once. Calling these inside the spread as well ran the whole
      // conversion twice for every request in the collection.
      const auth = exportAuth(request);
      const body = exportBody(request);
      return {
        name: request.name,
        request: {
          method: request.method,
          header: asRows(request.headers),
          url: exportUrl(request),
          ...(auth ? { auth } : {}),
          ...(body ? { body } : {}),
        },
      };
    }),
  };
}
