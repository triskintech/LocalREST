import { FEEDBACK_BASE_URL, uninstallUrl } from '../../lib/feedback/uninstallUrl';
import { REPO_URL, issueLink, repoLink } from '../../lib/links';
import { useStore } from '../state/store';
import { Wordmark } from './Wordmark';

/**
 * The version an installed extension actually reports, or null when there is
 * no manifest to ask — under `vite dev`, where a version number would be a
 * guess rather than a fact.
 */
function installedVersion(): string | null {
  if (typeof chrome === 'undefined' || !chrome.runtime?.getManifest) return null;
  try {
    return chrome.runtime.getManifest().version ?? null;
  } catch {
    return null;
  }
}

export function AboutSection() {
  const { state, dispatch } = useStore();
  const version = installedVersion();
  // Hidden until there is a page to send anyone to: a switch for a feature
  // that does not exist yet is just a puzzle.
  const canAskOnUninstall = uninstallUrl(FEEDBACK_BASE_URL, version ?? '') !== null;
  const repo = repoLink(REPO_URL);
  const issue = issueLink(REPO_URL, version ?? '');

  return (
    <section className="settings-section" aria-label="About">
      <div className="settings-legend">About</div>

      <div className="settings-identity">
        <Wordmark mark={false} />
        {version && <span className="settings-version mono">v{version}</span>}
      </div>

      {/* What it is, then why the claim is checkable. Not a feature list —
          whoever opens this already installed it, and came to check the
          version, the privacy claim, or where to report something. */}
      <p className="settings-hint">
        An API client that runs entirely in your browser. Requests, collections and history stay
        on this machine — the only network requests it makes are the ones you send.
      </p>

      {/* Specific negations, because "we respect your privacy" is what every
          product says and none of it is checkable. Each of these is. "No sync"
          is left out on purpose — it is what "no server" already means. */}
      <ul className="settings-facts">
        <li>No account</li>
        <li>No analytics</li>
        <li>No server</li>
      </ul>

      {/* Placed directly under that claim on purpose. It is the one exception
          to it, so it belongs where someone reading the claim will see it —
          not in a privacy policy they will not open. */}
      {canAskOnUninstall && (
        <label className="settings-check">
          <input
            type="checkbox"
            className="check"
            checked={state.data.uninstallFeedback}
            onChange={(e) =>
              dispatch({ type: 'setUninstallFeedback', enabled: e.target.checked })
            }
          />
          <span>Open a one-question feedback page if I uninstall</span>
        </label>
      )}

      {/* The one ask in the whole panel, and it costs the reader nothing —
          which is the point of it being a star rather than money. Rendered only
          once REPO_URL is set: see src/lib/links.ts. */}
      {/* Before the ask, deliberately. Someone who opened this panel because
          something is broken should not have to read past a request for a
          favour to find the way to say so. */}
      {issue && (
        <a
          className="btn btn-secondary settings-row"
          href={issue}
          target="_blank"
          rel="noreferrer"
        >
          <span>Report an issue</span>
          <span className="settings-row-glyph" aria-hidden="true">↗</span>
        </a>
      )}

      {repo && (
        <a
          className="btn btn-secondary settings-row"
          href={repo}
          target="_blank"
          rel="noreferrer"
        >
          <span>Star on GitHub</span>
          <span className="settings-row-glyph" aria-hidden="true">★</span>
        </a>
      )}
    </section>
  );
}
