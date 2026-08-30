/*
 * Picks the ground before the first paint.
 *
 * Deliberately plain, classic, blocking JavaScript in public/ rather than part
 * of the bundle: a module script is deferred, so the page would paint bone and
 * then repaint ink — the one flash you notice in a dark theme. The extension's
 * CSP forbids inline script, so this has to be its own file.
 *
 * It reads a mirror of AppData.theme (see src/app/theme.ts). The mirror can be
 * missing or stale; React corrects it on mount. Anything unreadable falls
 * through to the OS preference, which is the right answer for a first run.
 */
(function () {
  var pref = null;
  try {
    pref = window.localStorage.getItem('localrest:theme');
  } catch (error) {
    // Storage blocked. The OS preference below is a fine default.
  }
  var dark =
    pref === 'dark' ||
    (pref !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
})();
