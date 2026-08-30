/**
 * The match pattern naming the one origin a request needs.
 *
 * Host access is asked for per origin rather than up front for everything:
 * the extension ships with no host permissions at all, so nothing is granted
 * until a request actually needs it and the user says yes.
 *
 * The port is kept. `URL.origin` carries it, Chrome match patterns accept it,
 * and dropping it would silently widen a request for localhost:3000 into
 * every port on localhost — the opposite of what asking per origin is for.
 */
export function originPattern(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Not a URL yet: an unresolved {{variable}}, or half-typed. The send will
    // fail on its own terms and be diagnosed there.
    return null;
  }

  // Only the two schemes the manifest declares as optional. Anything else
  // (file:, data:, chrome-extension:) can never be granted, so asking would
  // throw rather than prompt.
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  return `${parsed.origin}/*`;
}

/** The host to name in a message about a request, or a stand-in if the URL
 *  never parsed. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'the server';
  }
}
