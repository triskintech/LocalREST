import { useRef, useState } from 'react';
import { backupFilename, fromBackup, toBackup } from '../../../lib/backup';
import { downloadJson } from '../../net/download';
import { useStore } from '../../state/store';
import { Dialog } from '../Dialog';

export function BackupDialog() {
  const { state, dispatch } = useStore();
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const close = () => dispatch({ type: 'closeDialog' });

  const exportAll = () => {
    downloadJson(backupFilename(), toBackup(state.data));
    dispatch({ type: 'toast', message: 'Backup downloaded.' });
    close();
  };

  const importAll = async (file: File) => {
    setError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setError('That file is not valid JSON.');
      return;
    }
    try {
      dispatch({ type: 'replaceAll', data: fromBackup(parsed) });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That backup could not be read.');
    }
  };

  const counts = {
    collections: state.data.collections.length,
    requests: state.data.collections.reduce((n, c) => n + c.requests.length, 0),
    environments: state.data.environments.length,
  };

  return (
    <Dialog
      wide
      title="Backup & data"
      onClose={close}
      actions={
        <button type="button" className="btn btn-secondary" onClick={close}>
          Close
        </button>
      }
    >
      <p className="dialog-body" style={{ margin: 0 }}>
        Everything you build here is stored in this browser and never sent anywhere.{' '}
        <strong>Uninstalling the extension or clearing the browser profile deletes it.</strong> A
        backup file is the only copy that survives.
      </p>

      <p className="text-muted mono" style={{ fontSize: 12, margin: 0 }}>
        {counts.collections} collection{counts.collections === 1 ? '' : 's'} · {counts.requests}{' '}
        request{counts.requests === 1 ? '' : 's'} · {counts.environments} environment
        {counts.environments === 1 ? '' : 's'}
      </p>

      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <button type="button" className="btn btn-primary" onClick={exportAll}>
          Export all
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => fileRef.current?.click()}
        >
          Import a backup…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(event) => {
            const file = event.target.files?.[0];
            // See ImportCollectionDialog: without this, re-picking the same
            // file after a failed restore does nothing at all.
            event.target.value = '';
            if (file) void importAll(file);
          }}
        />
      </div>

      <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>
        Importing a backup replaces everything currently in this workspace.
      </p>

      {error && <div className="kv-warning mono" style={{ margin: 0 }}>{error}</div>}
    </Dialog>
  );
}
