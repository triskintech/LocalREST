/**
 * Where Chrome sends someone when they uninstall — a one-question "why?" page.
 *
 * EMPTY UNTIL THE PAGE EXISTS. An unset base means no uninstall URL is
 * registered at all, so shipping before the form is live costs a dead tab to
 * nobody: the feature simply does not exist yet, and the Settings toggle that
 * discloses it stays hidden. Fill this in and it turns itself on.
 */
export const FEEDBACK_BASE_URL = '';

/**
 * The only thing this carries is the version being left behind, because
 * "everyone bails on 0.4.0" is the one question the page cannot ask for
 * itself. No ids, no install token, nothing about the user's requests — a URL
 * Chrome opens in a real tab is not a place to put anything worth protecting.
 *
 * Returns null when there is no page to send anyone to, which the caller must
 * treat as "register nothing".
 */
export function uninstallUrl(base: string, version: string): string | null {
  const trimmed = base.trim();
  if (trimmed === '') return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  // A misconfigured base must not become an uninstall-time navigation to
  // something unexpected.
  if (url.protocol !== 'https:') return null;

  if (version !== '') url.searchParams.set('v', version);
  return url.toString();
}
