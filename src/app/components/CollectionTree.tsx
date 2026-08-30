import { toCurl } from '../../lib/curl/toCurl';
import { exportPostman } from '../../lib/postman/exportCollection';
import type { ApiRequest, Collection } from '../../lib/types';
import { copyText, downloadJson } from '../net/download';
import { useStore } from '../state/store';
import { Menu } from './Menu';
import { MethodChip } from './MethodChip';
import { requestLabel } from '../../lib/request/label';

/** A filename that survives a collection named "Users / v2". */
const slug = (name: string) =>
  name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'collection';

export function CollectionTree() {
  const { state, dispatch } = useStore();
  const { collections } = state.data;
  // The row highlight follows the active tab; other open tabs get a quieter mark.
  const activeRequestId =
    state.data.tabs.find((t) => t.id === state.data.activeTabId)?.requestId ?? null;
  const openRequestIds = new Set(
    state.data.tabs.map((t) => t.requestId).filter((id): id is string => id !== null),
  );

  const copyAsCurl = async (request: ApiRequest) => {
    const ok = await copyText(toCurl(request));
    dispatch({
      type: 'toast',
      message: ok ? 'Copied as curl.' : 'Could not reach the clipboard.',
    });
  };

  const exportCollection = (collection: Collection) => {
    downloadJson(`${slug(collection.name)}.postman_collection.json`, exportPostman(collection));
    dispatch({ type: 'toast', message: `Exported “${collection.name}”.` });
  };

  if (collections.length === 0) {
    return (
      <div className="state-center">
        <div className="state-title">No collections yet</div>
        <p className="state-detail text-muted">
          Build a request and save it, or import one from a curl command or a Postman export.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => dispatch({ type: 'newTab' })}
        >
          + New request
        </button>
      </div>
    );
  }

  return (
    <div>
      {collections.map((collection) => (
        <div className="tree-group" key={collection.id}>
          <div className="tree-row">
            <button
              type="button"
              className="btn tree-collection"
              aria-expanded={collection.expanded}
              onClick={() => dispatch({ type: 'toggleCollection', id: collection.id })}
            >
              <span className="tree-caret" aria-hidden="true">
                {collection.expanded ? '▾' : '▸'}
              </span>
              <span className="tree-label">{collection.name}</span>
              <span className="text-muted" style={{ fontSize: 11 }}>
                {collection.requests.length}
              </span>
            </button>
            <div className="row-actions">
              <Menu
                label={`Actions for ${collection.name}`}
                triggerClassName="btn btn-icon"
                trigger={<>⋯</>}
                items={[
                  {
                    kind: 'item',
                    label: 'Rename…',
                    onSelect: () =>
                      dispatch({
                        type: 'openDialog',
                        dialog: {
                          kind: 'rename',
                          target: 'collection',
                          id: collection.id,
                          name: collection.name,
                        },
                      }),
                  },
                  {
                    kind: 'item',
                    label: 'Export as Postman…',
                    onSelect: () => exportCollection(collection),
                  },
                  { kind: 'separator' },
                  {
                    kind: 'item',
                    label: 'Delete collection',
                    danger: true,
                    onSelect: () => dispatch({ type: 'deleteCollection', id: collection.id }),
                  },
                ]}
              />
            </div>
          </div>

          {collection.expanded &&
            collection.requests.map((request) => {
              const current = request.id === activeRequestId;
              const open = openRequestIds.has(request.id);
              return (
                <div className="tree-row" key={request.id}>
                  <button
                    type="button"
                    className={`btn tree-request${open && !current ? ' tree-request-open' : ''}`}
                    aria-current={current}
                    onClick={() => dispatch({ type: 'openRequest', id: request.id })}
                  >
                    <MethodChip method={request.method} />
                    <span className="tree-request-name">{requestLabel(request)}</span>
                  </button>
                  <div className="row-actions">
                    <Menu
                      label={`Actions for ${requestLabel(request)}`}
                      triggerClassName="btn btn-icon"
                      trigger={<>⋯</>}
                      items={[
                        {
                          kind: 'item',
                          label: 'Rename…',
                          onSelect: () =>
                            dispatch({
                              type: 'openDialog',
                              dialog: {
                                kind: 'rename',
                                target: 'request',
                                id: request.id,
                                name: requestLabel(request),
                              },
                            }),
                        },
                        {
                          kind: 'item',
                          label: 'Duplicate',
                          onSelect: () => dispatch({ type: 'duplicateRequest', id: request.id }),
                        },
                        {
                          kind: 'item',
                          label: 'Copy as curl',
                          onSelect: () => void copyAsCurl(request),
                        },
                        { kind: 'separator' },
                        {
                          kind: 'item',
                          label: 'Delete request',
                          danger: true,
                          onSelect: () => dispatch({ type: 'deleteRequest', id: request.id }),
                        },
                      ]}
                    />
                  </div>
                </div>
              );
            })}
        </div>
      ))}
    </div>
  );
}
