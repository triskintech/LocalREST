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
 *
 * `previous` is the row set the URL was last built from, and it is what makes
 * an edit in the table distinguishable from a key typed into the URL bar. A
 * key `previous` owned and `params` no longer does was renamed or deleted, so
 * the URL must lose it. Callers that are simply rendering a URL from rows —
 * buildRequest, toCurl — have no such history and correctly omit it.
 */
export function applyParamsToUrl(
  rawUrl: string,
  params: readonly KeyValue[],
  previous: readonly KeyValue[] = params,
): string {
  const { head: url, fragment } = splitFragment(rawUrl.trim());
  const named = params.filter((param) => param.key.trim() !== '');
  const questionMark = url.indexOf('?');
  const base = questionMark === -1 ? url : url.slice(0, questionMark);
  const carried = questionMark === -1 ? [] : splitPairs(url.slice(questionMark + 1));

  const owned = new Set(named.map((param) => param.key));

  // Without this, the old spelling of a renamed row looks exactly like a key
  // the user typed into the URL bar, and is preserved on that basis: typing
  // `example_key` left `e`, `ex`, `exa`… behind, one orphan per keystroke.
  // Deleting a row was the same fault with a worse ending — the key stayed in
  // the query and the param went out on the wire.
  const surrendered = new Set(
    previous.map((param) => param.key).filter((key) => key.trim() !== '' && !owned.has(key)),
  );
  const existing = carried.filter((pair) => !surrendered.has(pair.key));

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

  const pieces: string[] = [];
  const emitted = new Set<string>();

  /**
   * The rows decide the order of the keys they own; a key only the URL has
   * keeps its place among them.
   *
   * Anchoring a URL-only key to "after N owned keys" rather than to an index
   * is what lets both hold at once. Ordering owned keys by their position in
   * the URL instead looked equivalent, and was not: a row toggled off leaves
   * the query, so toggling it back on made it a key the URL did not have and
   * sent it to the end — the table read `a, b` while the URL read `b, a`,
   * which is exactly the drift these two views promise never to have.
   */
  const unowned: { raw: string; afterGroups: number }[] = [];
  const urlOrder: string[] = [];
  for (const pair of existing) {
    if (owned.has(pair.key)) {
      if (!urlOrder.includes(pair.key)) urlOrder.push(pair.key);
    } else {
      unowned.push({ raw: pair.raw, afterGroups: urlOrder.length });
    }
  }

  // Row order, but a key the URL already carried keeps its turn among them.
  const keyOrder: string[] = [];
  for (const param of named) if (!keyOrder.includes(param.key)) keyOrder.push(param.key);

  let flushed = 0;
  const flushUnownedUpTo = (groups: number) => {
    while (flushed < unowned.length && unowned[flushed]!.afterGroups <= groups) {
      pieces.push(unowned[flushed]!.raw);
      flushed += 1;
    }
  };

  let groupsEmitted = 0;
  for (const key of keyOrder) {
    flushUnownedUpTo(groupsEmitted);
    if (emitted.has(key)) continue;
    emitted.add(key);
    for (const row of named) if (row.key === key && row.enabled) pieces.push(encodeRow(row));
    groupsEmitted += 1;
  }
  flushUnownedUpTo(Number.MAX_SAFE_INTEGER);

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
