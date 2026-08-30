import { useEffect, useRef, type RefObject } from 'react';
import { MIN_EDITOR_HEIGHT, MIN_RESPONSE_HEIGHT } from '../../lib/types';
import { useStore } from '../state/store';

const KEYBOARD_STEP_PX = 24;

/** Keep a requested height inside the space actually available. */
export function clampEditorHeight(height: number, available: number): number {
  const max = Math.max(MIN_EDITOR_HEIGHT, available - MIN_RESPONSE_HEIGHT);
  return Math.min(Math.max(height, MIN_EDITOR_HEIGHT), max);
}

/**
 * Drags the boundary between the request editor and the response, letting the
 * response grow upward over a request you are no longer editing.
 *
 * Listeners live on `window` rather than using pointer capture — capture
 * retargets the click that ends a drag, which is what broke the tab close
 * button.
 */
export function PaneSplitter({
  panesRef,
  currentHeight,
}: {
  panesRef: RefObject<HTMLDivElement | null>;
  currentHeight: number;
}) {
  const { dispatch } = useStore();
  const dragging = useRef(false);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!dragging.current) return;
      const panes = panesRef.current;
      if (!panes) return;
      event.preventDefault();
      const rect = panes.getBoundingClientRect();
      dispatch({
        type: 'setEditorHeight',
        height: clampEditorHeight(event.clientY - rect.top, rect.height),
      });
    };

    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.classList.remove('is-resizing');
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dispatch, panesRef]);

  const nudge = (delta: number) => {
    const available = panesRef.current?.getBoundingClientRect().height ?? 0;
    dispatch({
      type: 'setEditorHeight',
      height: clampEditorHeight(currentHeight + delta, available),
    });
  };

  return (
    <div
      className="splitter"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize request and response panes"
      tabIndex={0}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        dragging.current = true;
        // A global cursor and no text selection while the pointer is down.
        document.body.classList.add('is-resizing');
      }}
      // Back to the default split, the way a window divider double-clicks home.
      onDoubleClick={() => dispatch({ type: 'setEditorHeight', height: null })}
      onKeyDown={(event) => {
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          nudge(-KEYBOARD_STEP_PX);
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          nudge(KEYBOARD_STEP_PX);
        }
      }}
    >
      <span className="splitter-grip" aria-hidden="true" />
    </div>
  );
}
