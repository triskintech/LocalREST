import { originPattern } from '../../lib/request/hostPattern';

/**
 * `granted`     — the extension may now reach this origin.
 * `denied`      — the user said no, and the request must not be sent.
 * `unavailable` — there is no permission to ask for: outside the extension
 *                 (vite dev), or a scheme the manifest cannot grant. The send
 *                 proceeds and fails on its own terms if it is going to.
 */
export type HostAccess = 'granted' | 'denied' | 'unavailable';

/**
 * Ask for access to one origin, the moment a request actually needs it.
 *
 * MUST be called synchronously from the event handler that the user's click
 * or keypress started. `chrome.permissions.request()` is only honoured inside
 * a user gesture, and any `await` before it spends that gesture — which is
 * why this does not check `permissions.contains()` first. It does not need
 * to: `request()` resolves straight through without a prompt when the origin
 * is already granted, so the check would buy nothing and cost the gesture.
 */
export async function requestHostAccess(url: string): Promise<HostAccess> {
  const pattern = originPattern(url);
  if (pattern === null) return 'unavailable';
  if (typeof chrome === 'undefined' || !chrome.permissions?.request) return 'unavailable';

  try {
    // Synchronous call; only its result is awaited.
    const granted = await chrome.permissions.request({ origins: [pattern] });
    return granted ? 'granted' : 'denied';
  } catch {
    // Chrome refuses the call outright — a pattern it will not accept, or a
    // gesture that has already been spent. Neither is a "no" from the user,
    // so let the send go ahead and be diagnosed by what actually happens.
    return 'unavailable';
  }
}

/**
 * Every scheme the manifest declares as optional — i.e. "all sites".
 *
 * Kept in step with `optional_host_permissions` in public/manifest.json by
 * hand: Chrome refuses to grant anything the manifest has not declared, so a
 * drift here shows up immediately as a request that cannot be granted.
 */
export const ALL_SITES = ['http://*/*', 'https://*/*'] as const;

/**
 * Whether the blanket grant is currently held. `null` outside the extension,
 * where the question does not apply.
 */
export async function hasAllSitesAccess(): Promise<boolean | null> {
  if (typeof chrome === 'undefined' || !chrome.permissions?.contains) return null;
  try {
    return await chrome.permissions.contains({ origins: [...ALL_SITES] });
  } catch {
    return null;
  }
}

/**
 * Trade the per-origin prompts for a single one covering every site.
 *
 * Nothing in the send path changes afterwards: an all-sites grant already
 * covers any single origin under it, so `requestHostAccess` keeps returning
 * straight through without prompting — for every origin at once, instead of
 * one at a time.
 *
 * Same user-gesture rule as `requestHostAccess` — call it from a click.
 */
export async function grantAllSites(): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.permissions?.request) return false;
  try {
    return await chrome.permissions.request({ origins: [...ALL_SITES] });
  } catch {
    return false;
  }
}

/**
 * Hand the blanket grant back. Origins granted one at a time before this are
 * unaffected — they were never part of it — so revoking returns the app to
 * asking per site rather than locking it out of hosts it already had.
 */
export async function revokeAllSites(): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.permissions?.remove) return false;
  try {
    return await chrome.permissions.remove({ origins: [...ALL_SITES] });
  } catch {
    return false;
  }
}
