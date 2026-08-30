import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { ApiRequest, OpenTab } from '../../lib/types';
import { tabTitle, useStore } from '../state/store';
import { MethodChip } from './MethodChip';

/** How far the pointer must travel before a click becomes a drag. */
const DRAG_THRESHOLD_PX = 4;

/**
 * Reordering uses pointer events on `window` rather than HTML5 drag-and-drop
 * or pointer capture. Capture retargets the following click to the captured
 * element, which silently eats clicks on the close button whenever the mouse
 * drifts a few pixels mid-click.
 */
export function TabBar() {
  const { state, dispatch } = useStore();
  const { tabs, activeTabId, collections } = state.data;
  const stripRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; startX: number; active: boolean } | null>(null);
  const suppressClick = useRef(false);

  // Kept in a ref so the window listeners never read a stale tab order.
  const latest = useRef({ tabs, dispatch });
  latest.current = { tabs, dispatch };

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const current = drag.current;
      if (!current) return;

      if (!current.active) {
        if (Math.abs(event.clientX - current.startX) < DRAG_THRESHOLD_PX) return;
        current.active = true;
        suppressClick.current = true;
      }

      const elements = [
        ...(stripRef.current?.querySelectorAll<HTMLElement>('[data-tab-id]') ?? []),
      ];
      const over = elements.find((element) => {
        const rect = element.getBoundingClientRect();
        return event.clientX >= rect.left && event.clientX <= rect.right;
      });

      const overId = over?.dataset['tabId'];
      if (!overId || overId === current.id) return;

      const list = latest.current.tabs;
      const from = list.findIndex((tab) => tab.id === current.id);
      const to = list.findIndex((tab) => tab.id === overId);
      if (from !== -1 && to !== -1) latest.current.dispatch({ type: 'moveTab', from, to });
    };

    const onUp = () => {
      const wasDragging = drag.current?.active ?? false;
      drag.current = null;
      // Let the click that ends a drag pass by before re-enabling activation.
      if (wasDragging) setTimeout(() => (suppressClick.current = false), 0);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, []);

  const requestFor = (tab: OpenTab): ApiRequest | null => {
    if (tab.requestId === null) return tab.draft;
    for (const collection of collections) {
      const found = collection.requests.find((r) => r.id === tab.requestId);
      if (found) return found;
    }
    return null;
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>, id: string) => {
    if (event.button !== 0) return;
    // Pressing the close button is never the start of a reorder.
    if ((event.target as HTMLElement).closest('.tab-close')) return;
    drag.current = { id, startX: event.clientX, active: false };
  };

  return (
    <div className="tabbar">
      <div className="tabbar-scroll" ref={stripRef} role="tablist" aria-label="Open requests">
        {tabs.map((tab) => {
          const request = requestFor(tab);
          const title = tabTitle(state.data, tab);
          const isActive = tab.id === activeTabId;

          return (
            <div
              key={tab.id}
              data-tab-id={tab.id}
              className={`tab${isActive ? ' tab-active' : ''}`}
              onPointerDown={(event) => onPointerDown(event, tab.id)}
            >
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                className="btn tab-label"
                title={title}
                onClick={() => {
                  if (suppressClick.current) return;
                  dispatch({ type: 'activateTab', id: tab.id });
                }}
                onAuxClick={(event) => {
                  // Middle-click closes, as in every browser.
                  if (event.button === 1) dispatch({ type: 'closeTab', id: tab.id });
                }}
              >
                {request && <MethodChip method={request.method} compact />}
                <span className="tab-title">{title}</span>
                {tab.requestId === null && (
                  <span className="tab-unsaved" title="Not saved to a collection" aria-hidden="true">
                    •
                  </span>
                )}
              </button>
              <button
                type="button"
                className="btn tab-close"
                aria-label={`Close ${title}`}
                onClick={() => dispatch({ type: 'closeTab', id: tab.id })}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        className="btn tab-new"
        aria-label="New request tab"
        title="New request tab"
        onClick={() => dispatch({ type: 'newTab' })}
      >
        +
      </button>
    </div>
  );
}
