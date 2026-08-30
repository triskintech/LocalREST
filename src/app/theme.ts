import type { Theme } from '../lib/types';

/**
 * Mirror of AppData.theme, kept only so the page can pick its ground before the
 * first paint. chrome.storage is async, so reading the real store would always
 * cost a frame of the wrong colour; localStorage is synchronous and readable
 * from `public/theme-boot.js`, which runs blocking in <head>.
 *
 * The mirror is a cache, never the source of truth. If the two ever disagree,
 * the store wins and rewrites it on the next render.
 */
// Must stay in step with the literal in public/theme-boot.js, which cannot
// import it — that file runs blocking in <head>, outside the bundle. A
// mismatch fails no test; it just costs a frame of the wrong colour on every
// cold load. Frozen from first release, like the other storage keys.
export const THEME_MIRROR_KEY = 'localrest:theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** What the user actually sees, once 'system' has asked the OS. */
export function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

/**
 * Stamps the resolved theme on <html>, so the stylesheet only has to carry one
 * `[data-theme='dark']` block instead of repeating every token inside a media
 * query as well.
 */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset['theme'] = resolveTheme(theme);
  try {
    window.localStorage.setItem(THEME_MIRROR_KEY, theme);
  } catch {
    // Private mode or a full quota: the app still works, it just repaints once
    // on the next load instead of opening straight into the right ground.
  }
}

/** Calls back when the OS flips while 'system' is selected. Returns cleanup. */
export function watchSystemTheme(onChange: () => void): () => void {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
