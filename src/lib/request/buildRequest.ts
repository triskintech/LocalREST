import { applyParamsToUrl } from '../url';
import { resolve } from '../variables/resolve';
import { BODYLESS_METHODS, type ApiRequest, type KeyValue, type Method } from '../types';

/**
 * Headers the Fetch spec reserves for the browser. Setting them is silently
 * ignored, so they are dropped here and reported, and the editor warns on the
 * row rather than letting the user believe the value was sent.
 */
const FORBIDDEN_HEADER_NAMES: ReadonlySet<string> = new Set([
  'accept-charset',
  'accept-encoding',
  'access-control-request-headers',
  'access-control-request-method',
  'connection',
  'content-length',
  'cookie',
  'cookie2',
  'date',
  'dnt',
  'expect',
  'host',
  'keep-alive',
  'origin',
  'referer',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'user-agent',
  'via',
]);

/**
 * The Fetch spec also forbids every header starting with `proxy-` or `sec-`,
 * which is how a hand-set `sec-ch-ua` silently arrives at the server carrying
 * Chrome's value instead of yours.
 */
export function isForbiddenHeader(name: string): boolean {
  const lower = name.trim().toLowerCase();
  return (
    FORBIDDEN_HEADER_NAMES.has(lower) ||
    lower.startsWith('proxy-') ||
    lower.startsWith('sec-')
  );
}

export type BuiltRequest = {
  method: Method;
  url: string;
  headers: Record<string, string>;
  body: BodyInit | undefined;
  /** Variable names with no value, in first-seen order. */
  missing: string[];
  /** Header names the browser will not let us set. */
  droppedHeaders: string[];
  /** Set when the request cannot be sent at all; url is then unusable. */
  error?: string;
};

/** UTF-8 safe base64, unlike a bare btoa() which throws above U+00FF. */
function base64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const lower = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === lower);
}

/**
 * Drop every casing of a header.
 *
 * HTTP header names are case-insensitive and users type them however they
 * like, so `delete headers['Content-Type']` misses a hand-typed
 * `content-type` entirely. Two spellings then survive into `new Headers()`,
 * which folds them into one comma-joined value — turning "the auth tab wins"
 * into "both are sent, and neither works".
 */
function deleteHeader(headers: Record<string, string>, name: string): void {
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) delete headers[key];
  }
}

/** Set a header so it replaces any other casing of the same name. */
function setHeader(headers: Record<string, string>, name: string, value: string): void {
  deleteHeader(headers, name);
  headers[name] = value;
}

/**
 * Turn a stored request into the exact arguments for one fetch call.
 *
 * Pure: no network, no DOM beyond FormData, no clock. Everything that is easy
 * to get wrong — variable substitution, query merging, auth, content types —
 * happens here where it can be tested directly.
 */
export function buildRequest(
  request: ApiRequest,
  vars: Record<string, string>,
  files: ReadonlyMap<string, File> = new Map(),
): BuiltRequest {
  const missing: string[] = [];

  const sub = (text: string): string => {
    const result = resolve(text, vars);
    for (const name of result.missing) if (!missing.includes(name)) missing.push(name);
    return result.text;
  };

  const active = (rows: KeyValue[]) => rows.filter((row) => row.enabled && row.key.trim() !== '');

  // ── headers ──────────────────────────────────────────────────────────────
  const headers: Record<string, string> = {};
  const droppedHeaders: string[] = [];
  for (const row of active(request.headers)) {
    const name = sub(row.key).trim();
    if (isForbiddenHeader(name)) {
      droppedHeaders.push(name);
      continue;
    }
    headers[name] = sub(row.value);
  }

  // ── url ──────────────────────────────────────────────────────────────────
  const rawUrl = sub(request.url).trim();
  if (rawUrl === '') {
    return {
      method: request.method,
      url: '',
      headers,
      body: undefined,
      missing,
      droppedHeaders,
      error: 'Enter a URL to send a request.',
    };
  }

  // Params own the query: this rewrites it from the rows, so a query that also
  // sits in the URL bar is replaced rather than duplicated.
  // Disabled rows are passed through too: applyParamsToUrl needs to see them
  // in order to strip that key out of a query the URL already carried.
  const auth = request.auth;
  const resolvedParams = request.params
    .filter((row) => row.key.trim() !== '')
    .map((row) => ({ ...row, key: sub(row.key), value: sub(row.value) }));

  // An api key bound for the query is just another param. Appending it through
  // url.searchParams instead would re-serialise the whole query as form data —
  // rewriting every other value's %20 to + on its way past, so turning the auth
  // tab on quietly changed what the other params said.
  if (auth.type === 'apikey' && auth.key.trim() !== '' && auth.apiKeyIn === 'query') {
    resolvedParams.push({
      id: 'auth-api-key',
      key: sub(auth.key),
      value: sub(auth.value),
      enabled: true,
    });
  }

  const urlWithParams = applyParamsToUrl(rawUrl, resolvedParams);

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(urlWithParams)
    ? urlWithParams
    : `https://${urlWithParams}`;
  let url: URL;
  try {
    url = new URL(withScheme);
    if (!url.hostname) throw new Error('no host');
  } catch {
    return {
      method: request.method,
      url: rawUrl,
      headers,
      body: undefined,
      missing,
      droppedHeaders,
      error: `“${rawUrl}” is not a URL that can be requested.`,
    };
  }

  // ── auth ─────────────────────────────────────────────────────────────────
  // Applied after headers so the auth tab wins over a stale hand-typed value.
  // The query variant was already folded into the URL above.
  if (auth.type === 'bearer' && auth.token.trim() !== '') {
    setHeader(headers, 'Authorization', `Bearer ${sub(auth.token)}`);
  } else if (auth.type === 'basic' && (auth.username !== '' || auth.password !== '')) {
    setHeader(headers, 'Authorization', `Basic ${base64(`${sub(auth.username)}:${sub(auth.password)}`)}`);
  } else if (auth.type === 'apikey' && auth.key.trim() !== '' && auth.apiKeyIn === 'header') {
    setHeader(headers, sub(auth.key), sub(auth.value));
  }

  // ── body ─────────────────────────────────────────────────────────────────
  let body: BodyInit | undefined;
  const { mode } = request.body;

  if (!BODYLESS_METHODS.has(request.method) && mode !== 'none') {
    if (mode === 'json' || mode === 'text') {
      body = sub(request.body.raw);
      if (!hasHeader(headers, 'content-type')) {
        headers['Content-Type'] = mode === 'json' ? 'application/json' : 'text/plain';
      }
    } else if (mode === 'x-www-form-urlencoded') {
      const params = new URLSearchParams();
      for (const row of active(request.body.urlencoded)) {
        params.append(sub(row.key), sub(row.value));
      }
      body = params.toString();
      if (!hasHeader(headers, 'content-type')) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }
    } else {
      // form-data: the browser must generate the multipart boundary, so any
      // Content-Type we set here would corrupt the request.
      const form = new FormData();
      for (const field of request.body.formData) {
        if (!field.enabled || field.key.trim() === '') continue;
        if (field.kind === 'file') {
          const file = files.get(field.id);
          if (file) form.append(sub(field.key), file, file.name);
        } else {
          form.append(sub(field.key), sub(field.value));
        }
      }
      body = form;
      deleteHeader(headers, 'Content-Type');
    }
  }

  return {
    method: request.method,
    url: url.toString(),
    headers,
    body,
    missing,
    droppedHeaders,
  };
}
