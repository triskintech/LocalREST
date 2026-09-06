import { applyParamsToUrl } from '../url';
import { resolve } from '../variables/resolve';
import { BODYLESS_METHODS, type ApiRequest, type KeyValue } from '../types';

/**
 * The request with every `{{variable}}` substituted.
 *
 * With no variables to hand this is an identity — `resolve` leaves a name it
 * cannot find exactly as it was — so the untouched-template behaviour is
 * simply this function called with an empty set, rather than a second path.
 */
function substituted(request: ApiRequest, vars: Record<string, string>): ApiRequest {
  const text = (value: string) => resolve(value, vars).text;
  const rows = <T extends KeyValue>(list: T[]): T[] =>
    list.map((row) => ({ ...row, key: text(row.key), value: text(row.value) }));

  return {
    ...request,
    url: text(request.url),
    params: rows(request.params),
    headers: rows(request.headers),
    body: {
      ...request.body,
      raw: text(request.body.raw),
      formData: rows(request.body.formData),
      urlencoded: rows(request.body.urlencoded),
    },
    auth: {
      ...request.auth,
      token: text(request.auth.token),
      username: text(request.auth.username),
      password: text(request.auth.password),
      key: text(request.auth.key),
      value: text(request.auth.value),
    },
  };
}

/**
 * Single-quote for a POSIX shell. There is no escape sequence inside single
 * quotes, so an embedded quote has to close, escape, and reopen.
 */
function quote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

const active = (rows: KeyValue[]) => rows.filter((row) => row.enabled && row.key.trim() !== '');

/**
 * Fold enabled params into the url, since curl has no separate param flag.
 *
 * Uses the same `applyParamsToUrl` the sender does, for two reasons. It has
 * replace-not-append semantics, so a query that parseCurl deliberately left in
 * *both* the URL and the params rows is not doubled on the first round trip.
 * And it is string surgery rather than `new URL()`, so a `{{baseUrl}}/x`
 * template survives — the old path prepended a scheme and let URL parsing
 * lower-case the host, quietly rewriting `{{baseUrl}}` to `{{baseurl}}`, which
 * no longer matches the environment variable it names.
 */
function urlWithParams(request: ApiRequest): string {
  const named = request.params.filter((row) => row.key.trim() !== '');
  const { auth } = request;
  // An api key bound for the query string is part of the URL, exactly as the
  // sender treats it — emitting it as a header, or not at all, would hand back
  // a command that does not authenticate.
  const withKey =
    auth.type === 'apikey' && auth.key.trim() !== '' && auth.apiKeyIn === 'query'
      ? [...named, { id: 'auth', key: auth.key, value: auth.value, enabled: true }]
      : named;

  if (withKey.length === 0) return request.url;
  return applyParamsToUrl(request.url, withKey);
}

/**
 * Render a request as a curl command, wrapped across lines the way curl
 * commands are usually shared. `parseCurl` reads its output back.
 *
 * `vars` decides what the command is for. With the active environment, it is
 * a command that runs — which is the point of copying one — and it carries
 * whatever secret the auth fields hold. Empty, it is the portable template,
 * safe to paste in front of anyone and re-importable with its variables
 * still variables.
 */
export function toCurl(request: ApiRequest, vars: Record<string, string> = {}): string {
  const resolved = substituted(request, vars);
  const parts: string[] = [];

  if (resolved.method !== 'GET') parts.push(`-X ${resolved.method}`);

  for (const header of active(resolved.headers)) {
    parts.push(`-H ${quote(`${header.key}: ${header.value}`)}`);
  }

  const { auth } = resolved;
  if (auth.type === 'bearer' && auth.token) {
    parts.push(`-H ${quote(`Authorization: Bearer ${auth.token}`)}`);
  } else if (auth.type === 'basic' && (auth.username || auth.password)) {
    parts.push(`-u ${quote(`${auth.username}:${auth.password}`)}`);
  } else if (auth.type === 'apikey' && auth.key && auth.apiKeyIn === 'header') {
    parts.push(`-H ${quote(`${auth.key}: ${auth.value}`)}`);
  }
  // The query case is handled in the URL below — it used to be dropped, so the
  // copied command 401'd with nothing to show why.

  if (!BODYLESS_METHODS.has(resolved.method)) {
    const { body } = resolved;
    if (body.mode === 'json' || body.mode === 'text') {
      if (body.raw) parts.push(`--data-raw ${quote(body.raw)}`);
    } else if (body.mode === 'x-www-form-urlencoded') {
      for (const field of active(body.urlencoded)) {
        parts.push(`--data-urlencode ${quote(`${field.key}=${field.value}`)}`);
      }
    } else if (body.mode === 'form-data') {
      for (const field of body.formData) {
        if (!field.enabled || !field.key) continue;
        const value = field.kind === 'file' ? `@${field.fileName ?? ''}` : field.value;
        parts.push(`-F ${quote(`${field.key}=${value}`)}`);
      }
    }
  }

  const head = `curl ${quote(urlWithParams(resolved))}`;
  return parts.length === 0 ? head : `${head} \\\n  ${parts.join(' \\\n  ')}`;
}
