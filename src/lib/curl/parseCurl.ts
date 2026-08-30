import { newId } from '../ids';
import { splitQuery } from '../url';
import {
  METHODS,
  emptyAuth,
  emptyBody,
  newRequest,
  type ApiRequest,
  type FormField,
  type KeyValue,
  type Method,
} from '../types';

/** Flags that change nothing about the request we would build. */
const IGNORED_FLAGS = new Set([
  '-L',
  '--location',
  '-i',
  '--include',
  '-s',
  '--silent',
  '-S',
  '--show-error',
  '-k',
  '--insecure',
  '-v',
  '--verbose',
  '-g',
  '--globoff',
  '--compressed',
  '--fail',
  '-f',
  '--no-buffer',
  '-N',
]);

/** Short flags that take a value, for splitting bundles like `-sX POST`. */
const SHORT_FLAGS_WITH_VALUE = new Set(['X', 'H', 'd', 'u', 'F', 'b', 'A', 'e']);

const DATA_FLAGS = new Set(['-d', '--data', '--data-raw', '--data-binary', '--data-ascii']);

/**
 * Headers Chrome's "Copy as cURL" attaches that describe the browser rather
 * than the request. They are imported so nothing is hidden, but arrive
 * unticked: they mean nothing to an API and, because they are not
 * CORS-safelisted, each one forces a preflight that most servers reject —
 * turning a curl that works in a terminal into "Could not connect".
 */
const BROWSER_NOISE_HEADERS = new Set([
  'pragma',
  'priority',
  'dnt',
  'upgrade-insecure-requests',
  'x-requested-with',
]);

/**
 * Split a shell command into tokens the way bash would: honouring single
 * quotes, double quotes with escapes, `$'…'` ANSI-C quoting and backslash line
 * continuations. The prototype's regex tokeniser handled none of the last
 * three, which is exactly what Chrome DevTools emits.
 */
export function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let started = false;
  let i = 0;

  const push = () => {
    if (started) tokens.push(current);
    current = '';
    started = false;
  };

  while (i < input.length) {
    const char = input[i] as string;

    if (char === '\\' && input[i + 1] === '\n') {
      i += 2;
      continue;
    }
    if (char === '\\' && input[i + 1] === '\r' && input[i + 2] === '\n') {
      i += 3;
      continue;
    }

    if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
      push();
      i += 1;
      continue;
    }

    // $'…' — backslash escapes are interpreted.
    if (char === '$' && input[i + 1] === "'") {
      started = true;
      i += 2;
      while (i < input.length && input[i] !== "'") {
        if (input[i] === '\\') {
          const next = input[i + 1];
          const mapped =
            next === 'n' ? '\n' : next === 't' ? '\t' : next === 'r' ? '\r' : next ?? '';
          current += mapped;
          i += 2;
          continue;
        }
        current += input[i];
        i += 1;
      }
      i += 1;
      continue;
    }

    // '…' — everything is literal.
    if (char === "'") {
      started = true;
      i += 1;
      while (i < input.length && input[i] !== "'") {
        current += input[i];
        i += 1;
      }
      i += 1;
      continue;
    }

    // "…" — backslash escapes the next character.
    if (char === '"') {
      started = true;
      i += 1;
      while (i < input.length && input[i] !== '"') {
        if (input[i] === '\\' && i + 1 < input.length) {
          current += input[i + 1];
          i += 2;
          continue;
        }
        current += input[i];
        i += 1;
      }
      i += 1;
      continue;
    }

    if (char === '\\' && i + 1 < input.length) {
      started = true;
      current += input[i + 1];
      i += 2;
      continue;
    }

    started = true;
    current += char;
    i += 1;
  }

  push();
  return tokens;
}

/** Long flags whose next token is a value, never a flag of its own. */
const LONG_FLAGS_WITH_VALUE = new Set([
  '--request',
  '--header',
  '--data',
  '--data-raw',
  '--data-binary',
  '--data-ascii',
  '--data-urlencode',
  '--form',
  '--user',
  '--cookie',
  '--user-agent',
  '--referer',
  '--url',
]);

/** Whether the token after this one belongs to it rather than standing alone. */
function expectsValue(token: string): boolean {
  if (LONG_FLAGS_WITH_VALUE.has(token)) return true;
  return (
    token.length === 2 &&
    token.startsWith('-') &&
    SHORT_FLAGS_WITH_VALUE.has(token.slice(1))
  );
}

/** `-sX POST` → `-s`, `-X`, `POST`. */
function expandShortFlags(tokens: string[]): string[] {
  const out: string[] = [];
  // A flag's value is data, not flags. Expanding it anyway is how
  // `-d '-abc'` used to be shredded into a body of "-a" plus an invented
  // cookie flag, with the leftover letters free to be read as the URL.
  let takesNext = false;

  for (const token of tokens) {
    if (takesNext) {
      out.push(token);
      takesNext = false;
      continue;
    }

    const isBundle =
      token.length > 2 && token.startsWith('-') && !token.startsWith('--') && /^[-a-zA-Z]+$/.test(token);

    if (!isBundle) {
      out.push(token);
      takesNext = expectsValue(token);
      continue;
    }

    const letters = token.slice(1).split('');
    for (const [index, letter] of letters.entries()) {
      out.push(`-${letter}`);
      // A value-taking flag consumes the rest of the bundle as its value — and
      // the bundle then ends. Continuing to emit those characters as flags is
      // how `-XPATCH` used to become `-X PATCH -P -A TCH -T -C -H`, inventing a
      // User-Agent from "TCH" and letting the trailing -H swallow the URL.
      if (SHORT_FLAGS_WITH_VALUE.has(letter)) {
        if (index < letters.length - 1) out.push(letters.slice(index + 1).join(''));
        // `-sd` ends the bundle with a value-taking flag, so the value is the
        // next token and must reach the parser untouched.
        else takesNext = true;
        break;
      }
    }
  }

  return out;
}

const hasScheme = (token: string) => /^[a-z][a-z0-9+.-]*:\/\//i.test(token);

/**
 * Whether an unknown flag should swallow the token after it.
 *
 * Shape alone cannot decide this: `--resolve example.com:443:1.2.3.4` looks
 * exactly as much like a host as a scheme-less URL does. So look ahead
 * instead. An explicit scheme means the token is the URL and belongs to
 * nobody else; otherwise the flag takes it, unless it is the only bare token
 * left — in which case the flag was valueless and this is the URL.
 */
function flagTakesValue(tokens: readonly string[], valueIndex: number): boolean {
  const value = tokens[valueIndex];
  if (value === undefined || value.startsWith('-')) return false;
  if (hasScheme(value)) return false;
  return tokens.slice(valueIndex + 1).some((token) => !token.startsWith('-'));
}

const kv = (key: string, value: string): KeyValue => ({
  id: newId(),
  key,
  value,
  enabled: true,
});

function splitOnce(text: string, separator: string): [string, string] | null {
  const index = text.indexOf(separator);
  if (index === -1) return null;
  return [text.slice(0, index).trim(), text.slice(index + separator.length).trim()];
}

/**
 * Whether pasted text is a curl command rather than a URL — the signal the
 * URL bar uses to switch from typing a field to importing a request.
 *
 * Requires whitespace (or end of input) after "curl" so a hostname that
 * merely starts with the word, like curl.example.com, is never mistaken for
 * one. A leading shell prompt is stripped first, since a command copied out
 * of a terminal often carries one.
 */
export function looksLikeCurl(text: string): boolean {
  const withoutPrompt = text.trim().replace(/^\$\s*/, '');
  return /^curl(\s|$)/i.test(withoutPrompt);
}

/**
 * Parse a curl command into a request. Unknown flags are skipped rather than
 * treated as the URL, so a command with an option we do not model still
 * imports the parts we do.
 */
export function parseCurl(input: string): ApiRequest {
  const tokens = expandShortFlags(tokenize(input.trim()));

  let method: Method | null = null;
  let url = '';
  const headers: KeyValue[] = [];
  const dataParts: string[] = [];
  const urlencoded: KeyValue[] = [];
  const formData: FormField[] = [];
  let userPair: string | null = null;
  let asQuery = false;

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i] as string;

    // Case-insensitive: curl the program does not care how its own name is
    // cased, so `cURL`/`CURL` pasted from wherever must skip the same way
    // lowercase does. Missing this used to leave the mis-cased token as the
    // only bare word seen, so it was read as the URL — silently dropping the
    // real one, which arrived second and found `url` already "set".
    if (token.toLowerCase() === 'curl' || IGNORED_FLAGS.has(token)) continue;

    // -G moves the data onto the URL instead of into a body. Skipping it
    // imported `curl -G -d a=1` as a POST carrying a body — a different
    // request to a different endpoint shape, with nothing said about it.
    if (token === '-G' || token === '--get') {
      asQuery = true;
      continue;
    }

    if (token === '-X' || token === '--request') {
      const value = (tokens[++i] ?? '').toUpperCase();
      if ((METHODS as readonly string[]).includes(value)) method = value as Method;
      continue;
    }

    if (token === '-H' || token === '--header') {
      const pair = splitOnce(tokens[++i] ?? '', ':');
      if (pair && pair[0]) {
        const header = kv(pair[0], pair[1]);
        if (BROWSER_NOISE_HEADERS.has(pair[0].toLowerCase())) header.enabled = false;
        headers.push(header);
      }
      continue;
    }

    if (DATA_FLAGS.has(token)) {
      dataParts.push(tokens[++i] ?? '');
      continue;
    }

    if (token === '--data-urlencode') {
      const value = tokens[++i] ?? '';
      const pair = splitOnce(value, '=');
      if (pair && pair[0]) {
        urlencoded.push(kv(pair[0], pair[1]));
      } else if (value !== '') {
        // curl also takes `content` and `=content`, which carry a payload with
        // no name. There is no row that can hold a nameless field — an empty
        // key is dropped before sending — so keep it as raw data rather than
        // discarding the body and importing a request that sends nothing.
        dataParts.push(pair ? pair[1] : value);
      }
      continue;
    }

    if (token === '-F' || token === '--form') {
      const pair = splitOnce(tokens[++i] ?? '', '=');
      if (!pair) continue;
      const [key, value] = pair;
      if (value.startsWith('@')) {
        const path = value.slice(1);
        formData.push({
          ...kv(key, ''),
          kind: 'file',
          fileName: path.split('/').pop() || path,
        });
      } else {
        formData.push({ ...kv(key, value), kind: 'text' });
      }
      continue;
    }

    if (token === '-u' || token === '--user') {
      userPair = tokens[++i] ?? '';
      continue;
    }

    if (token === '-b' || token === '--cookie') {
      headers.push(kv('Cookie', tokens[++i] ?? ''));
      continue;
    }

    if (token === '-A' || token === '--user-agent') {
      headers.push(kv('User-Agent', tokens[++i] ?? ''));
      continue;
    }

    if (token === '-e' || token === '--referer') {
      headers.push(kv('Referer', tokens[++i] ?? ''));
      continue;
    }

    if (token === '--url') {
      url = tokens[++i] ?? '';
      continue;
    }

    // An unrecognised flag may still take a value, and skipping only the flag
    // leaves that value to be read as the URL — which is how `--retry 3` used
    // to import with the URL set to "3" and the real one dropped. The guard
    // used to require a URL to already be known, i.e. it only fired once it no
    // longer mattered. Decide on the token itself instead: consume it unless
    // it looks like the URL we are still missing.
    if (token.startsWith('-')) {
      if (url !== '' ? tokens[i + 1]?.startsWith('-') === false : flagTakesValue(tokens, i + 1)) {
        i += 1;
      }
      continue;
    }

    if (!url) url = token;
  }

  // ── body ─────────────────────────────────────────────────────────────────
  // Under -G the data is the query, so it is appended to the URL and read back
  // as params below rather than becoming a body.
  if (asQuery && (dataParts.length > 0 || urlencoded.length > 0)) {
    const query = [
      ...dataParts,
      ...urlencoded.map(
        (row) => `${encodeURIComponent(row.key)}=${encodeURIComponent(row.value)}`,
      ),
    ].join('&');
    if (query !== '') url += (url.includes('?') ? '&' : '?') + query;
    dataParts.length = 0;
    urlencoded.length = 0;
  }

  const body = emptyBody();
  if (formData.length > 0) {
    body.mode = 'form-data';
    body.formData = formData;
  } else if (urlencoded.length > 0) {
    body.mode = 'x-www-form-urlencoded';
    body.urlencoded = urlencoded;
  } else if (dataParts.length > 0) {
    // Repeated -d flags are concatenated with & by curl itself.
    body.raw = dataParts.join('&');
    body.mode = /^\s*[[{]/.test(body.raw) ? 'json' : 'text';
  }

  const auth = emptyAuth();
  if (userPair !== null) {
    const pair = splitOnce(userPair, ':');
    auth.type = 'basic';
    auth.username = pair ? pair[0] : userPair;
    auth.password = pair ? pair[1] : '';
  }

  const hasBody = body.mode !== 'none';

  // The query is listed as editable Params rows *and* left in the URL, so the
  // imported command still reads the way it was pasted. They cannot drift:
  // buildRequest rewrites the query from the params before sending.
  const split = splitQuery(url);

  return newRequest(newId(), {
    // Left unnamed on purpose: the sidebar and the tab then render the live
    // URL. Baking the path into a name at import time is the drift this app
    // avoids everywhere else — edit the URL afterwards and the name would go
    // on confidently saying /users about a request that now posts to /orders.
    name: '',
    method: method ?? (hasBody ? 'POST' : 'GET'),
    url,
    params: split.params,
    headers,
    body,
    auth,
  });
}
