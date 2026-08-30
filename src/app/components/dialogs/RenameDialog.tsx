import { useState } from 'react';
import { useStore, type Dialog as DialogState } from '../../state/store';
import { Dialog } from '../Dialog';

type RenameState = Extract<DialogState, { kind: 'rename' }>;

export function RenameDialog({ dialog }: { dialog: RenameState }) {
  const { dispatch } = useStore();
  const [name, setName] = useState(dialog.name);
  const close = () => dispatch({ type: 'closeDialog' });

  const commit = () => {
    const trimmed = name.trim();
    if (trimmed === '') return;
    dispatch(
      dialog.target === 'request'
        ? { type: 'renameRequest', id: dialog.id, name: trimmed }
        : { type: 'renameCollection', id: dialog.id, name: trimmed },
    );
  };

  return (
    <Dialog
      title={dialog.target === 'request' ? 'Rename request' : 'Rename collection'}
      onClose={close}
      actions={
        <>
          <button type="button" className="btn btn-secondary" onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={name.trim() === ''}
            onClick={commit}
          >
            Rename
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="rename-name">Name</label>
        <input
          id="rename-name"
          className="input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
          }}
        />
      </div>
    </Dialog>
  );
}
