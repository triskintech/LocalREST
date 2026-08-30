import { outline, rowText } from '../../lib/json/outline';
import { parseJson } from '../../lib/json/parseJson';
import { diagnoseFetchFailure } from '../../lib/request/diagnose';
import { hostOf } from '../../lib/request/hostPattern';
import type { BuiltRequest } from '../../lib/request/buildRequest';
import type { ResponseHeader, ResponseResult } from './response';

/** Past this, a <pre> starts locking up the tab. */
const MAX_RENDER_CHARS = 1_000_000;

const DEFAULT_TIMEOUT_MS = 60_000;

/** Long enough to distinguish a slow host from a dead one, short enough that a
 *  failed request does not sit twice as long before saying so. */
const PROBE_TIMEOUT_MS = 4_000;

/**
 * Whether the extension currently holds permission for this URL's origin.
 * Returns null outside the extension, where the question does not apply.
 *
 * Declared host permissions are granted at install, but Chrome lets the user
 * narrow an extension's site access afterwards — and a request refused for
 * that reason fails exactly like an unreachable host.
 */
async function hasHostAccess(url: string): Promise<boolean | null> {
  if (typeof chrome === 'undefined' || !chrome.permissions) return null;
  try {
    const origin = new URL(url).origin;
    return await chrome.permissions.contains({ origins: [`${origin}/*`] });
  } catch {
    return null;
  }
}

/**
 * Did the host answer at all?
 *
 * A no-cors request is exempt from the check that just failed: the browser
 * still refuses to let us *read* the reply, but it resolves instead of
 * throwing once bytes come back. That difference is the only way from inside
 * a page to tell a blocked cross-origin read from a host that is genuinely
 * not there, and it is what stops the pane blaming the network for a missing
 * response header.
 *
 * HEAD with no custom headers, because this fires on a request that already
 * failed and must not be the thing that changes server state. Returns null if
 * the probe itself could not decide.
 */
async function probeReachable(url: string): Promise<boolean | null> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), PROBE_TIMEOUT_MS);
  try {
    await fetch(url, { method: 'HEAD', mode: 'no-cors', signal: abort.signal });
    return true;
  } catch {
    // Aborting is inconclusive — a slow host is not a missing one.
    return abort.signal.aborted ? null : false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Re-indent a JSON body. Goes through the outline rather than
 * JSON.stringify(JSON.parse(…)) so that a number too large for a double keeps
 * the digits the server sent instead of being silently rounded.
 */
function prettyPrint(text: string, contentType: string): string {
  if (!contentType.includes('json')) return text;
  try {
    return outline(parseJson(text)).map(rowText).join('\n');
  } catch {
    // Content-Type promised JSON but the body isn't; show it verbatim.
    return text;
  }
}

/**
 * The one impure step: everything up to here is a pure transformation of the
 * stored request, and everything after is rendering.
 */
export async function execute(
  built: BuiltRequest,
  signal: AbortSignal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<ResponseResult> {
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);

  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), timeoutMs);
  const combined = AbortSignal.any([signal, timeout.signal]);

  try {
    // Built separately so an illegal header name or value is reported as the
    // header problem it is, rather than surfacing as a bare TypeError that
    // looks identical to the host being unreachable.
    let requestHeaders: Headers;
    try {
      requestHeaders = new Headers(built.headers);
    } catch (headerError) {
      return {
        kind: 'failure',
        title: 'Invalid header',
        detail: `A header on this request is not something the browser will send: ${
          headerError instanceof Error ? headerError.message : String(headerError)
        }. Check for stray spaces, newlines or non-ASCII characters in a header name or value.`,
        timeMs: elapsed(),
      };
    }

    const response = await fetch(built.url, {
      method: built.method,
      headers: requestHeaders,
      body: built.body,
      signal: combined,
      redirect: 'follow',
    });

    const headers: ResponseHeader[] = [...response.headers.entries()].map(([key, value]) => ({
      key,
      value,
    }));
    const raw = await response.text();
    const timeMs = elapsed();
    const sizeBytes = new Blob([raw]).size;
    const contentType = response.headers.get('content-type') ?? '';

    const truncated = raw.length > MAX_RENDER_CHARS;
    const shown = truncated ? raw.slice(0, MAX_RENDER_CHARS) : raw;

    return {
      kind: 'success',
      url: response.url || built.url,
      status: response.status,
      statusText: response.statusText || '',
      headers,
      bodyText: truncated ? shown : prettyPrint(shown, contentType),
      // Kept alongside the rendered text so "Save response" can write what
      // arrived rather than what the viewer chose to show.
      rawBodyText: shown,
      truncated,
      timeMs,
      sizeBytes,
    };
  } catch (error) {
    const timeMs = elapsed();

    if (timeout.signal.aborted) {
      return {
        kind: 'failure',
        title: 'Timed out',
        detail: `${hostOf(built.url)} did not respond within ${Math.round(
          timeoutMs / 1000,
        )} seconds. The server may be slow or unreachable.`,
        timeMs,
      };
    }

    if (signal.aborted) {
      return { kind: 'failure', title: 'Cancelled', detail: 'You stopped this request.', timeMs };
    }

    // fetch reports DNS failures, refused connections, TLS errors and blocked
    // cross-origin requests as one indistinguishable TypeError, so narrow it
    // down with the one thing we can actually check.
    if (error instanceof TypeError) {
      const host = hostOf(built.url);
      const online = navigator.onLine;
      const permitted = await hasHostAccess(built.url);
      // Only worth asking once the request has already failed, and only when
      // the answer can still change the diagnosis: a missing host permission
      // or a browser that knows it is offline already explains the failure, so
      // probing would spend up to four more seconds — and a second request at
      // a host we have just been told not to touch — to learn nothing.
      const decided = permitted === false || !online;
      const reachable = decided ? null : await probeReachable(built.url);

      // Everything needed to tell the causes apart, in one place, so a
      // screenshot of the console is enough to diagnose a failure remotely.
      console.error('[LocalREST] request failed', {
        url: built.url,
        method: built.method,
        headerNames: Object.keys(built.headers),
        bodyKind: built.body === undefined ? 'none' : built.body.constructor.name,
        hostPermission: permitted,
        hostReachable: reachable,
        online,
        error: `${error.name}: ${error.message}`,
        cause: error.cause,
      });

      const { title, detail } = diagnoseFetchFailure({
        host,
        message: error.message,
        hostPermission: permitted,
        online,
        reachable,
      });
      return { kind: 'failure', title, detail, timeMs };
    }

    return {
      kind: 'failure',
      title: 'Request failed',
      detail: error instanceof Error ? error.message : String(error),
      timeMs,
    };
  } finally {
    clearTimeout(timer);
  }
}
