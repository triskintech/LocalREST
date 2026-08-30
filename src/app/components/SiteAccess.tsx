import { useCallback, useEffect, useState } from 'react';
import { grantAllSites, hasAllSitesAccess, revokeAllSites } from '../net/hostAccess';
import { useStore } from '../state/store';

type Choice = 'all' | 'per-site';

/**
 * The choice between being asked per site and being asked once.
 *
 * LocalREST ships holding no host access and asks for one origin at a time,
 * which is the honest default — but someone working across a dozen services
 * meets a dozen prompts to get started. This trades them all for one.
 *
 * Both states stay on screen rather than one button that toggles: which one
 * you are in is the thing worth knowing here, and a lone button labelled with
 * the action leaves you inferring the state from the verb.
 *
 * Renders its own section band, heading included, so that outside the
 * extension — under `vite dev`, where there are no permissions to hold — the
 * whole band disappears rather than leaving a heading over an empty space.
 */
export function SiteAccess() {
  const { dispatch } = useStore();
  const [all, setAll] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    void hasAllSitesAccess().then(setAll);
  }, []);

  // Runs on open: the panel only mounts this while it is showing, so the state
  // is re-read rather than remembered from whenever the app started — access
  // granted through a send prompt, or revoked in chrome://extensions, both
  // land here without this component having to watch for them.
  useEffect(refresh, [refresh]);

  if (all === null) return null;

  const choice: Choice = all ? 'all' : 'per-site';

  const select = (next: Choice) => {
    if (busy || next === choice) return;
    setBusy(true);
    // Nothing is awaited before this: Chrome only honours permissions.request()
    // inside the gesture that reached here, and a permissions.contains() check
    // first would spend it.
    const action = next === 'all' ? grantAllSites() : revokeAllSites();
    void action
      .then((ok) => {
        if (ok) {
          dispatch({
            type: 'toast',
            message:
              next === 'all'
                ? 'Access to all sites granted. Sending will never prompt.'
                : 'Access to all sites revoked. LocalREST will ask per site again.',
          });
        }
        // Re-read either way. A declined prompt leaves the permission exactly
        // as it was, and reading it back is what snaps the radio off the
        // option the click had already selected in the DOM.
        refresh();
      })
      .finally(() => setBusy(false));
  };

  return (
    <section className="settings-section" aria-label="Site access">
      <div className="settings-legend">Site access</div>
      <div
        className={`seg seg-compact seg-fill${busy ? ' seg-busy' : ''}`}
        role="group"
        aria-label="Site access"
      >
        <label className="seg-opt">
          <input
            type="radio"
            name="site-access"
            value="all"
            checked={choice === 'all'}
            disabled={busy}
            onChange={() => select('all')}
          />
          Allow all sites
        </label>
        <label className="seg-opt">
          <input
            type="radio"
            name="site-access"
            value="per-site"
            checked={choice === 'per-site'}
            disabled={busy}
            onChange={() => select('per-site')}
          />
          Ask me per site
        </label>
      </div>
      <p className="settings-hint">
        {all
          ? 'Every site is allowed, so sending never prompts.'
          : 'Each new host is asked for the first time you send to it.'}
      </p>
    </section>
  );
}
