/**
 * The project's public home.
 *
 * An empty string hides the Star row entirely rather than rendering a link to
 * nowhere — the whole point of the About section is that everything in it is
 * checkable, and a dead link sitting under "No account / No analytics /
 * No server" undercuts the three lines above it.
 */
export const REPO_URL = 'https://github.com/triskintech/LocalREST';

/**
 * `base` if it is a usable https URL, else null.
 *
 * https only, and not merely on principle: this is rendered as a link the user
 * clicks from an extension page, and http would be silently downgraded or
 * blocked depending on the browser's mood rather than failing visibly.
 */
export function repoLink(base: string): string | null {
  const trimmed = base.trim();
  if (trimmed === '') return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;

  return url.toString();
}

/**
 * A prefilled "new issue" URL for `base`, or null when `base` is unusable.
 *
 * The version is filled in because it is the one fact every useful bug report
 * needs and the one a reporter never thinks to include. It discloses nothing
 * new — the uninstall page already carries exactly this — and unlike that
 * page, the reporter sees the whole body in GitHub's form and can delete any
 * of it before submitting. Nothing is sent by opening the link.
 */
export function issueLink(base: string, version: string): string | null {
  const repo = repoLink(base);
  if (repo === null) return null;

  const url = new URL(`${repo.replace(/\/+$/, '')}/issues/new`);
  const footer = version === '' ? '' : `\n\n---\nLocalREST v${version}`;
  url.searchParams.set(
    'body',
    `<!-- What happened, and what did you expect instead? -->\n${footer}`,
  );
  return url.toString();
}
