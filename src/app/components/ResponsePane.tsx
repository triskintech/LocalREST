import { responseFilename } from '../../lib/filename';
import { useStore } from '../state/store';
import { downloadText } from '../net/download';
import { formatSize, statusTone, type ResponseState } from '../net/response';
import { CodeBlock } from './CodeBlock';

export function ResponsePane({ response }: { response: ResponseState }) {
  const { state, dispatch } = useStore();
  const tab = state.responseTab;
  const done = response.phase === 'done' ? response.result : null;
  const success = done?.kind === 'success' ? done : null;

  const saveBody = () => {
    if (!success) return;
    const contentType =
      success.headers.find((h) => h.key.toLowerCase() === 'content-type')?.value ?? '';
    // The body as received: not the folded view, and not the re-indented text
    // the pane renders.
    downloadText(
      responseFilename(success.url, contentType),
      success.rawBodyText,
      contentType || 'text/plain',
    );
    dispatch({ type: 'toast', message: 'Response saved.' });
  };

  return (
    <div className="response">
      <div className="response-strip">
        <span className="response-legend text-muted">Response</span>

        {done?.kind === 'success' && (
          <span className={`status-pill mono status-${statusTone(done.status)}`}>
            {done.status} {done.statusText}
          </span>
        )}

        {done?.kind === 'failure' && (
          <span className="status-pill mono status-server-error">{done.title}</span>
        )}

        {success && (
          <div className="response-tabs" role="tablist" aria-label="Response view">
            <button
              type="button"
              role="tab"
              className="btn response-tab"
              aria-selected={tab === 'body'}
              onClick={() => dispatch({ type: 'setResponseTab', tab: 'body' })}
            >
              Body
            </button>
            <button
              type="button"
              role="tab"
              className="btn response-tab"
              aria-selected={tab === 'headers'}
              onClick={() => dispatch({ type: 'setResponseTab', tab: 'headers' })}
            >
              Headers
            </button>
          </div>
        )}

        {/* Timing and size are the least-read things here, so they sit furthest right. */}
        {done && (
          <div className="response-meta">
            <span className="mono text-muted">{done.timeMs} ms</span>
            {success && <span className="mono text-muted">{formatSize(success.sizeBytes)}</span>}
            {success && (
              <button type="button" className="btn btn-secondary response-save" onClick={saveBody}>
                Save response
              </button>
            )}
          </div>
        )}
      </div>

      <div className="response-body">
        {response.phase === 'idle' && (
          <div className="state-center">
            <p className="state-detail text-muted mono">Send a request to see the response</p>
          </div>
        )}

        {response.phase === 'sending' && (
          <div className="state-center">
            <p className="state-detail text-muted mono">Sending…</p>
          </div>
        )}

        {done?.kind === 'failure' && (
          <div className="state-center state-error">
            <div className="state-title">{done.title}</div>
            <p className="state-detail text-muted">{done.detail}</p>
          </div>
        )}

        {success && tab === 'body' && (
          <>
            <CodeBlock text={success.bodyText} />
            {/* The cap is on characters, not bytes — formatSize rendered it as
                "976.56 KB", a unit it never had. */}
            {success.truncated && (
              <p className="text-muted mono" style={{ fontSize: 12, marginTop: 'var(--space-2)' }}>
                Showing the first {success.bodyText.length.toLocaleString()} characters of a{' '}
                {formatSize(success.sizeBytes)} response.
              </p>
            )}
          </>
        )}

        {success && tab === 'headers' && (
          <table className="table mono">
            <tbody>
              {success.headers.map((header) => (
                <tr key={header.key}>
                  <td className="text-muted" style={{ width: 220 }}>
                    {header.key}
                  </td>
                  <td>{header.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
