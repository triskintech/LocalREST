import { useStore, type Dialog as DialogState } from '../../state/store';
import { Dialog } from '../Dialog';

type ConfirmState = Extract<DialogState, { kind: 'confirm-delete' }>;

/**
 * Deleting is the only action here that destroys work, and the workspace lives
 * in this browser and nowhere else — there is no server copy, no trash, and no
 * undo. So it asks, and it says what goes.
 *
 * Cancel takes the focus rather than Delete: the safe choice should be the one
 * that a reflexive Enter or Space lands on.
 */
export function ConfirmDeleteDialog({ dialog }: { dialog: ConfirmState }) {
  const { state, dispatch } = useStore();
  const close = () => dispatch({ type: 'closeDialog' });

  const requestCount =
    dialog.target === 'collection'
      ? (state.data.collections.find((each) => each.id === dialog.id)?.requests.length ?? 0)
      : 0;

  const confirm = () => {
    dispatch(
      dialog.target === 'request'
        ? { type: 'deleteRequest', id: dialog.id }
        : { type: 'deleteCollection', id: dialog.id },
    );
    dispatch({ type: 'closeDialog' });
  };

  return (
    <Dialog
      title={dialog.target === 'request' ? 'Delete request' : 'Delete collection'}
      onClose={close}
      actions={
        <>
          <button type="button" className="btn btn-secondary" data-autofocus onClick={close}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={confirm}>
            Delete
          </button>
        </>
      }
    >
      <p className="confirm-text">
        {dialog.target === 'collection' && requestCount > 0 ? (
          <>
            <strong>{dialog.name}</strong> and the {requestCount} request
            {requestCount === 1 ? '' : 's'} in it will be deleted.
          </>
        ) : (
          <>
            <strong>{dialog.name}</strong> will be deleted.
          </>
        )}
      </p>
      <p className="confirm-text text-muted">
        This cannot be undone. Nothing is stored outside this browser, so there is no other
        copy to restore from.
      </p>
    </Dialog>
  );
}
