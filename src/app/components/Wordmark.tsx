/**
 * The brand lockup: the outlined mark, then `Local://REST`.
 *
 * `Local://REST` is a rendered lockup, never a string — every string in the
 * product stays `LocalREST`, which is why this carries an aria-label rather than
 * letting a screen reader announce the slashes. See brand/README.md.
 *
 * Mark geometry matches scripts/make-brand.mjs, expressed against `--mark-size`
 * so the two stay in step: 2/28 border, 4/28 padding, 4/28 rule, 4/28 gap.
 */
export function Wordmark({ mark = true }: { mark?: boolean }) {
  return (
    <span className="lockup" role="img" aria-label="LocalREST">
      {mark && (
        <span className="lockup-mark">
          <i />
          <i />
        </span>
      )}
      <span className="wordmark">
        <span className="wordmark-name">Local</span>
        <span className="wordmark-sep">://</span>
        <span className="wordmark-rest">REST</span>
      </span>
    </span>
  );
}
