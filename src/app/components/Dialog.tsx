import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Escape closes, focus moves into the dialog on open and the backdrop click
 * dismisses — the three things a keyboard user needs and the prototype's
 * static markup did not have.
 */
export function Dialog({
  title,
  description,
  children,
  actions,
  onClose,
  wide = false,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  actions: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Callers pass an inline arrow, so onClose is a new function on every render.
  // Reading it through a ref keeps both effects mount-only — otherwise the
  // focus call below re-runs after every keystroke and yanks the caret back to
  // the first field, which silently truncates anything you type.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    // A dialog can nominate its own default with `data-autofocus`; otherwise the
    // first focusable element wins, which is right for a form and wrong for a
    // choice whose recommended answer is not the first button. React's own
    // autoFocus is not enough here — this effect runs after it and would take
    // the focus straight back.
    const panel = panelRef.current;
    const target =
      panel?.querySelector<HTMLElement>('[data-autofocus]') ??
      panel?.querySelector<HTMLElement>('input, textarea, select, button');
    target?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div
      className="dialog-backdrop"
      style={{ zIndex: 50 }}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`dialog${wide ? ' dialog-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={panelRef}
      >
        <div className="dialog-title">{title}</div>
        {description && <div className="dialog-body">{description}</div>}
        {children}
        <div className="dialog-actions">{actions}</div>
      </div>
    </div>
  );
}
