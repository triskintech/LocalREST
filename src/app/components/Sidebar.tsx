import type { RefObject } from 'react';
import { useStore } from '../state/store';
import { CollectionTree } from './CollectionTree';
import { HistoryList } from './HistoryList';

export function Sidebar({
  sidebarRef,
  width,
}: {
  sidebarRef: RefObject<HTMLDivElement | null>;
  /** Pixel width, or null for the CSS default. */
  width: number | null;
}) {
  const { state, dispatch } = useStore();
  const view = state.sidebarView;

  return (
    <div className="sidebar" ref={sidebarRef} style={width === null ? undefined : { width }}>
      <div className="sidebar-tabs" role="tablist" aria-label="Sidebar">
        <button
          type="button"
          role="tab"
          className="btn sidebar-tab"
          aria-selected={view === 'collections'}
          onClick={() => dispatch({ type: 'setSidebarView', view: 'collections' })}
        >
          Collections
        </button>
        <button
          type="button"
          role="tab"
          className="btn sidebar-tab"
          aria-selected={view === 'history'}
          onClick={() => dispatch({ type: 'setSidebarView', view: 'history' })}
        >
          History
        </button>
      </div>
      <div className="sidebar-body">
        {view === 'collections' ? <CollectionTree /> : <HistoryList />}
      </div>
    </div>
  );
}
