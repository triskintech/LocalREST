import { useEffect, useState } from 'react';
import { grantAllSites, hasAllSitesAccess } from '../net/hostAccess';
import { markSiteAccessAsked, readOnboarding } from '../onboarding';
import { useStore } from '../state/store';
import { Dialog } from './Dialog';

type Phase = 'checking' | 'ask' | 'done';

/**
 * The one time LocalREST asks about site access up front.
 *
 * The extension installs holding no host access at all, so the alternative to
 * this is meeting a Chrome prompt per host — fine for one API, tedious across
 * a dozen staging services. Offering the blanket grant once, at install, turns
 * that into a single decision.
 *
 * It is offered, never insisted on. Both buttons — and a dismissal — are
 * final: the panel does not come back, and declining simply leaves the
 * per-host prompts in place, which is a working app rather than a dead end.
 * That fallback is also what keeps the broad request defensible on review:
 * the narrow path is the default, and this is opt-in.
 */
export function FirstRunPanel() {
  const { dispatch } = useStore();
  const [phase, setPhase] = useState<Phase>('checking');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void Promise.all([readOnboarding(), hasAllSitesAccess()]).then(([onboarding, all]) => {
      if (!live) return;
      // Three ways there is nothing to ask: no extension to hold permissions
      // (vite dev, where `all` is null), the grant is already held, or this
      // install has been asked once already.
      setPhase(all === null || all === true || onboarding.siteAccessAsked ? 'done' : 'ask');
    });
    return () => {
      live = false;
    };
  }, []);

  if (phase !== 'ask') return null;

  const settle = () => {
    setBusy(false);
    setPhase('done');
  };

  const allow = () => {
    setBusy(true);
    // Called first and with nothing awaited before it: Chrome only honours
    // permissions.request() inside the gesture that reached this line, and
    // reading storage first would spend it.
    void grantAllSites()
      .then((ok) => {
        dispatch({
          type: 'toast',
          message: ok
            ? 'Access to all sites granted. Sending will never prompt.'
            : 'Left as-is — LocalREST will ask the first time you send to each host.',
        });
        // Marked either way. A declined Chrome prompt is an answer, and
        // re-asking on the next launch is the nagging this exists to avoid.
        return markSiteAccessAsked();
      })
      .finally(settle);
  };

  const perSite = () => {
    setBusy(true);
    void markSiteAccessAsked().finally(settle);
  };

  return (
    <Dialog
      title="Site access"
      onClose={perSite}
      actions={
        <>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={perSite}>
            Ask me per site
          </button>
          {/* The default action: focused on open, so Return takes it. Chrome
              still raises its own prompt afterwards and nothing is granted
              without answering that, so defaulting here picks the recommended
              option without deciding anything on the user's behalf. */}
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={allow}
            data-autofocus
          >
            Allow all sites
          </button>
        </>
      }
    >
      <div className="dialog-body">
        <p style={{ marginTop: 0 }}>
          LocalREST sends requests straight from your browser, so Chrome has to grant it access
          to the hosts you call.
        </p>
        <p>
          Allow all sites once and it never asks again. Otherwise it asks the first time you send
          to each new host.
        </p>
        <p style={{ marginBottom: 0 }}>You can switch either way later in Settings ⚙ → Site access.</p>
      </div>
    </Dialog>
  );
}
