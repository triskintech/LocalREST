import { useEffect, useRef, useState, type ReactNode } from 'react';

export type MenuItem =
  | { kind: 'item'; label: string; onSelect: () => void; danger?: boolean }
  | { kind: 'separator' }
  /** Arbitrary content (e.g. a control) rather than a single clickable action. */
  | { kind: 'custom'; content: ReactNode };

/**
 * A dropdown that closes on outside click and on Escape, and returns focus to
 * its trigger so keyboard users are never stranded.
 */
export function Menu({
  trigger,
  items,
  triggerClassName = 'btn btn-secondary',
  label,
  panelClassName,
  panelRole = 'menu',
}: {
  trigger: ReactNode;
  items: MenuItem[];
  triggerClassName?: string;
  label: string;
  panelClassName?: string;
  /**
   * 'menu' is right for a list of actions and wrong for a panel of form
   * controls: radios and buttons are not valid children of a menu, so the
   * settings popover passes 'group' instead.
   */
  panelRole?: 'menu' | 'group';
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!anchorRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="menu-anchor" ref={anchorRef}>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
      >
        {trigger}
      </button>
      {open && (
        <div
          className={`menu${panelClassName ? ` ${panelClassName}` : ''}`}
          role={panelRole}
          aria-label={panelRole === 'group' ? label : undefined}
        >
          {items.map((item, index) => {
            if (item.kind === 'separator') {
              // eslint-disable-next-line react/no-array-index-key -- separators carry no identity
              return <div className="menu-sep" key={`sep-${index}`} />;
            }
            if (item.kind === 'custom') {
              // eslint-disable-next-line react/no-array-index-key -- custom content carries no identity
              return (
                <div className="menu-custom" key={`custom-${index}`}>
                  {item.content}
                </div>
              );
            }
            return (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={`btn menu-item${item.danger ? ' menu-item-danger' : ''}`}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
