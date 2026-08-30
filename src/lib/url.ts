import { newId } from './ids';
import type { KeyValue } from './types';

/**
 * Pull a query string off a URL and return it as param rows.
 *
 * An imported request whose query is buried in the URL is awkward to edit —
 * you have to hand-edit a string to toggle one value. Splitting is lossless:
 * buildRequest merges enabled params back on before sending, so the request
 * that goes out is byte-identical to the one that came in.
 */
export function splitQuery(rawUrl: string): { url: string; params: KeyValue[] } {
  const { head: url, fragment } = splitFragment(rawUrl.trim());
  const questionMark = url.indexOf('?');
  if (questionMark === -1) return { url: url + fragment, params: [] };

  const base = url.slice(0, questionMark);
  const query = url.slice(questionMark + 1);
  if (query === '') return { url: base + fragment, params: [] };

  // A template like {{baseUrl}}?a=1 still splits, so variables keep working.
  const params: KeyValue[] = splitPairs(query).map((pair) => ({
    id: newId(),
    key: pair.key,
    value: pair.value,
    enabled: true,
  }));

  return params.length > 0
    ? { url: base + fragment, params }
    : { url: url + fragment, params: [] };
}

/**
 * One `key=value` piece of a query, decoded for display *and* kept verbatim.
 *
 * The raw text is what makes the round trip lossless. Decoding and re-encoding
 * is not an identity: `+` decodes to a space and encodes back to `%20`, which
 * silently rewrites the query of any URL carrying a literal `+` — a base64
 * signature in a presigned S3/GCS link, for instance, which then fails to
 * verify while the URL bar still shows what was pasted.
 */
type QueryPair = { key: string; value: string; raw: string };

function splitPairs(query: string): QueryPair[] {
  const pairs: QueryPair[] = [];
  for (const piece of query.split('&')) {
    if (piece === '') continue;
    const equals = piece.indexOf('=');
    const key = equals === -1 ? piece : piece.slice(0, equals);
    const value = equals === -1 ? '' : piece.slice(equals + 1);
    pairs.push({ key: safeDecode(key), value: safeDecode(value), raw: piece });
  }
  return pairs;
}

/**
 * Split a trailing `#fragment` off a URL.
 *
 * A fragment is never sent to the server, so it must not be swept into the
 * query: `?a=1#section` used to split into a param whose value was
 * `1#section`, which then percent-encoded to `a=1%23section` and travelled to
 * the server as a literal `#` — or vanished entirely when a param row of the
 * same name replaced it.
 */
function splitFragment(url: string): { head: string; fragment: string } {
  const hash = url.indexOf('#');
  return hash === -1
    ? { head: url, fragment: '' }
    : { head: url.slice(0, hash), fragment: url.slice(hash) };
}

/**
 * Write param rows back into a URL's query string.
 *
 * Params own every key they name: enabled rows replace that key's values,
 * a key whose rows are all disabled is removed, and any other query key the
 * URL already carried is left alone. That is what lets the query live in the
 * URL bar *and* the Params table without the two fighting or doubling up —
 * buildRequest applies this same function, so what you see is what is sent.
 */
export function applyParamsToUrl(rawUrl: string, params: readonly KeyValue[]): string {
  const { head: url, fragment } = splitFragment(rawUrl.trim());
  const named = params.filter((param) => param.key.trim() !== '');
  const questionMark = url.indexOf('?');
  const base = questionMark === -1 ? url : url.slice(0, questionMark);
  const existing = questionMark === -1 ? [] : splitPairs(url.slice(questionMark + 1));

  // Anything the params do not own is copied over character for character
  // rather than decoded and re-encoded. See QueryPair: re-encoding is not an
  // identity, and the difference lands on the wire.
  if (named.length === 0) {
    return (existing.length > 0 ? `${base}?${rawOf(existing)}` : base) + fragment;
  }

  /**
   * A row's text for the query. A row that still says exactly what the URL
   * said keeps the URL's own spelling — only a value the user actually changed
   * is re-encoded from scratch.
   */
  const encodeRow = (row: KeyValue): string => {
    const untouched = existing.find((pair) => pair.key === row.key && pair.value === row.value);
    return untouched
      ? untouched.raw
      : `${encodeURIComponent(row.key)}=${encodeURIComponent(row.value)}`;
  };

  const owned = new Set(named.map((param) => param.key));
  const pieces: string[] = [];
  const emitted = new Set<string>();

  // Keep the original ordering of keys the URL already had.
  for (const pair of existing) {
    if (!owned.has(pair.key)) {
      pieces.push(pair.raw);
      continue;
    }
    if (emitted.has(pair.key)) continue;
    emitted.add(pair.key);
    for (const row of named) if (row.key === pair.key && row.enabled) pieces.push(encodeRow(row));
  }

  // Then anything the params introduce that the URL did not have.
  for (const param of named) {
    if (emitted.has(param.key) || !param.enabled) continue;
    emitted.add(param.key);
    for (const row of named) if (row.key === param.key && row.enabled) pieces.push(encodeRow(row));
  }

  return (pieces.length > 0 ? `${base}?${pieces.join('&')}` : base) + fragment;
}

const rawOf = (pairs: readonly QueryPair[]): string => pairs.map((pair) => pair.raw).join('&');

/** `+` means space in a query string, and a stray % must not throw. */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}
