import { useState } from 'react';
import { activeRequest, activeTab, useStore } from '../../state/store';
import { Dialog } from '../Dialog';
import { requestLabel } from '../../../lib/request/label';

const NEW_COLLECTION = '__new__';

/**
 * The prototype faked saving with a toast. A real save needs somewhere to put
 * the request and something to call it, so it asks for both — and it works the
 * same whether the tab holds an unsaved draft or a request already in a
 * collection, where it renames and moves it.
 */
export function SaveRequestDialog() {
  const { state, dispatch } = useStore();
  const request = activeRequest(state);
  const tab = activeTab(state);
  const { collections } = state.data;

  const isDraft = tab?.requestId === undefined || tab.requestId === null;
  const currentCollection = collections.find((collection) =>
    collection.requests.some((r) => r.id === tab?.requestId),
  );

  // Offers the URL when unnamed, which is what the sidebar is already showing.
  const [name, setName] = useState(requestLabel(request));
  const [target, setTarget] = useState(
    currentCollection?.id ?? collections[0]?.id ?? NEW_COLLECTION,
  );
  const [collectionName, setCollectionName] = useState('My requests');

  const close = () => dispatch({ type: 'closeDialog' });
  const creatingCollection = target === NEW_COLLECTION;
  const canSave = name.trim() !== '' && (!creatingCollection || collectionName.trim() !== '');

  const save = () => {
    if (!canSave) return;
    dispatch({
      type: 'saveRequest',
      collectionId: creatingCollection ? null : target,
      collectionName: collectionName.trim(),
      name: name.trim(),
    });
  };

  return (
    <Dialog
      title="Save request"
      description={
        isDraft
          ? 'Give it a name and choose where it lives.'
          : 'Rename it, or move it to another collection.'
      }
      onClose={close}
      actions={
        <>
          <button type="button" className="btn btn-secondary" onClick={close}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={!canSave} onClick={save}>
            Save request
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="save-name">Name</label>
        <input
          id="save-name"
          className="input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
          }}
        />
      </div>

      <div className="field">
        <label htmlFor="save-collection">Collection</label>
        <select
          id="save-collection"
          className="input"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        >
          {collections.map((collection) => (
            <option key={collection.id} value={collection.id}>
              {collection.name}
            </option>
          ))}
          <option value={NEW_COLLECTION}>New collection…</option>
        </select>
      </div>

      {creatingCollection && (
        <div className="field">
          <label htmlFor="save-collection-name">New collection name</label>
          <input
            id="save-collection-name"
            className="input"
            type="text"
            value={collectionName}
            onChange={(e) => setCollectionName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
            }}
          />
        </div>
      )}
    </Dialog>
  );
}
