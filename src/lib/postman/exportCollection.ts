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

/** Split the query string off so it can also be listed in `url.query`. */
function exportUrl(request: ApiRequest) {
  const query = asRows(request.params);
  return query.length > 0 ? { raw: request.url, query } : { raw: request.url };
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
