import { useEffect, useRef, type RefObject } from 'react';
import { MAX_SIDEBAR_WIDTH, MIN_BUILDER_WIDTH, MIN_SIDEBAR_WIDTH } from '../../lib/types';
import { useStore } from '../state/store';

const KEYBOARD_STEP_PX = 24;

/** Keep a requested sidebar width inside the space actually available. */
export function clampSidebarWidth(width: number, available: number): number {
  const max = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, available - MIN_BUILDER_WIDTH));
  return Math.min(Math.max(width, MIN_SIDEBAR_WIDTH), max);
}

/**
 * Drags the boundary between the sidebar and the request builder.
 *
 * Same shape as PaneSplitter — listeners on `window` rather than pointer
 * capture, for the same reason: capture retargets the click that ends a
 * drag, which is what broke the tab close button.
 */
export function SidebarSplitter({
  mainRef,
  currentWidth,
}: {
  mainRef: RefObject<HTMLDivElement | null>;
  currentWidth: number;
}) {
  const { dispatch } = useStore();
  const dragging = useRef(false);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!dragging.current) return;
      const main = mainRef.current;
      if (!main) return;
      event.preventDefault();
      const rect = main.getBoundingClientRect();
      dispatch({
        type: 'setSidebarWidth',
        width: clampSidebarWidth(event.clientX - rect.left, rect.width),
      });
    };

    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.classList.remove('is-resizing-col');
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dispatch, mainRef]);

  const nudge = (delta: number) => {
    const available = mainRef.current?.getBoundingClientRect().width ?? 0;
    dispatch({
      type: 'setSidebarWidth',
      width: clampSidebarWidth(currentWidth + delta, available),
    });
  };

  return (
    <div
      className="splitter splitter-vertical"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      tabIndex={0}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        dragging.current = true;
        document.body.classList.add('is-resizing-col');
      }}
      // Back to the default width, the way a window divider double-clicks home.
      onDoubleClick={() => dispatch({ type: 'setSidebarWidth', width: null })}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          nudge(-KEYBOARD_STEP_PX);
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          nudge(KEYBOARD_STEP_PX);
        }
      }}
    >
      <span className="splitter-grip splitter-grip-vertical" aria-hidden="true" />
    </div>
  );
}
