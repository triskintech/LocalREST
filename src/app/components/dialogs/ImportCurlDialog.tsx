import { useState } from 'react';
import { parseCurl } from '../../../lib/curl/parseCurl';
import { useStore } from '../../state/store';
import { Dialog } from '../Dialog';

const PLACEHOLDER = `curl -X POST https://httpbin.org/post \\
  -H 'Content-Type: application/json' \\
  -d '{"name":"ada"}'`;

export function ImportCurlDialog() {
  const { dispatch } = useStore();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const close = () => dispatch({ type: 'closeDialog' });

  const doImport = () => {
    const trimmed = text.trim();
    if (trimmed === '') {
      setError('Paste a curl command first.');
      return;
    }
    try {
      const request = parseCurl(trimmed);
      if (!request.url) {
        setError('No URL found in that command.');
        return;
      }
      dispatch({ type: 'importRequest', request });
    } catch {
      setError('That could not be read as a curl command.');
    }
  };

  return (
    <Dialog
      title="Import curl"
      description="Paste a curl command. Method, URL, headers, body and auth are read from it — including what Chrome DevTools puts on your clipboard."
      onClose={close}
      actions={
        <>
          <button type="button" className="btn btn-secondary" onClick={close}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={doImport}>
            Import
          </button>
        </>
      }
    >
      <textarea
        className="input mono"
        aria-label="curl command"
        style={{ minHeight: 140, fontSize: 12 }}
        placeholder={PLACEHOLDER}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
      />
      {error && <div className="kv-warning mono" style={{ margin: 0 }}>{error}</div>}
    </Dialog>
  );
}
