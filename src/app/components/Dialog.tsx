import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Everything focusable, in the order Tab would reach it.
 *
 * `getClientRects()` rather than `offsetParent`, which is null for anything
 * positioned fixed and would drop the whole panel on a surface that used it.
 */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Escape closes, focus moves into the dialog on open and stays inside it, and
 * the backdrop click dismisses — the things a keyboard user needs and the
 * prototype's static markup did not have.
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
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      // `aria-modal="true"` tells assistive technology that everything behind
      // this panel is inert, and the backdrop makes it unreachable by mouse.
      // Tab was walking out into it anyway, which left the claim false and the
      // keyboard user in content they could see but not act on.
      const panel = panelRef.current;
      if (!panel) return;

      const stops = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.getClientRects().length > 0,
      );
      if (stops.length === 0) {
        event.preventDefault();
        return;
      }

      const first = stops[0]!;
      const last = stops[stops.length - 1]!;
      const active = document.activeElement;

      // Focus outside the panel entirely — a backdrop click, or a stray
      // programmatic focus. Pull it back rather than tabbing on from there.
      if (!(active instanceof Node) || !panel.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
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
