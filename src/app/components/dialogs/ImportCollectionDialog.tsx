import { useRef, useState } from 'react';
import { importPostman } from '../../../lib/postman/importCollection';
import { useStore } from '../../state/store';
import { Dialog } from '../Dialog';

export function ImportCollectionDialog() {
  const { dispatch } = useStore();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const close = () => dispatch({ type: 'closeDialog' });

  const doImport = (source: string) => {
    const trimmed = source.trim();
    if (trimmed === '') {
      setError('Paste a collection, or choose an export file.');
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      setError('That is not valid JSON.');
      return;
    }

    try {
      const { collection, environment } = importPostman(parsed);
      dispatch({ type: 'importCollection', collection, environment });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That collection could not be read.');
    }
  };

  return (
    <Dialog
      title="Import Postman collection"
      description="Choose a v2.1 export file, or paste one below. Folders are flattened into request names and collection variables become an environment."
      onClose={close}
      actions={
        <>
          <button type="button" className="btn btn-secondary" onClick={close}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => doImport(text)}>
            Import
          </button>
        </>
      }
    >
      <div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            // Cleared so picking the same file again still fires a change —
            // otherwise a retry after a failed import silently does nothing.
            event.target.value = '';
            if (!file) return;
            setError(null);
            // Real exports run to megabytes; pasting them is miserable.
            doImport(await file.text());
          }}
        />
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => fileRef.current?.click()}
        >
          Choose file…
        </button>
      </div>

      <textarea
        className="input mono"
        aria-label="Collection JSON"
        style={{ minHeight: 140, fontSize: 12 }}
        placeholder={'{"info":{"name":"My collection"},"item":[…]}'}
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
