import { describe, expect, it } from 'vitest';
import { REPO_URL, issueLink, repoLink } from './links';

describe('repoLink', () => {
  it('returns an https url unchanged apart from normalisation', () => {
    expect(repoLink('https://github.com/owner/localrest')).toBe(
      'https://github.com/owner/localrest',
    );
  });

  it('trims surrounding whitespace', () => {
    expect(repoLink('  https://github.com/owner/localrest  ')).toBe(
      'https://github.com/owner/localrest',
    );
  });

  it('rejects an empty string, so the row stays hidden until one is set', () => {
    expect(repoLink('')).toBeNull();
    expect(repoLink('   ')).toBeNull();
  });

  it('rejects http, which would be downgraded or blocked rather than failing loudly', () => {
    expect(repoLink('http://github.com/owner/localrest')).toBeNull();
  });

  it('rejects anything that is not a url', () => {
    expect(repoLink('github.com/owner/localrest')).toBeNull();
    expect(repoLink('not a url')).toBeNull();
  });

  // REPO_URL is shipped, so what matters is that it survives its own validator:
  // a typo here would not fail the build, it would silently drop the Star row.
  it('ships a REPO_URL the validator accepts', () => {
    expect(repoLink(REPO_URL)).not.toBeNull();
  });

  it('ships a REPO_URL pointing at the project, not an example', () => {
    expect(REPO_URL).toBe('https://github.com/triskintech/LocalREST');
  });
});

describe('issueLink', () => {
  it('points at the new-issue form for the repo', () => {
    const url = new URL(issueLink('https://github.com/owner/localrest', '1.0.0')!);
    expect(url.origin + url.pathname).toBe('https://github.com/owner/localrest/issues/new');
  });

  it('carries the version, so a report arrives with the one fact triage needs', () => {
    const url = new URL(issueLink('https://github.com/owner/localrest', '1.0.0')!);
    expect(url.searchParams.get('body')).toContain('LocalREST v1.0.0');
  });

  // Under `vite dev` there is no manifest to ask, and "LocalREST v" followed by
  // nothing is worse than no line at all.
  it('omits the version line when there is no version', () => {
    const url = new URL(issueLink('https://github.com/owner/localrest', '')!);
    expect(url.searchParams.get('body')).not.toContain('LocalREST v');
  });

  it('does not double the slash when the repo url has a trailing one', () => {
    expect(issueLink('https://github.com/owner/localrest/', '1.0.0')).toContain(
      '/localrest/issues/new',
    );
  });

  it('is null whenever the repo url is, so the row hides with the star row', () => {
    expect(issueLink('', '1.0.0')).toBeNull();
    expect(issueLink('http://github.com/owner/localrest', '1.0.0')).toBeNull();
    expect(issueLink('not a url', '1.0.0')).toBeNull();
  });
});
