import { useEffect, useRef, useState, type ReactNode } from 'react';

export type MenuItem =
  | { kind: 'item'; label: string; onSelect: () => void; danger?: boolean }
  | { kind: 'separator' }
  /** Arbitrary content (e.g. a control) rather than a single clickable action. */
  | { kind: 'custom'; content: ReactNode };

/**
 * A dropdown that closes on outside click and on Escape, returns focus to its
 * trigger so keyboard users are never stranded, and — when it really is a menu
 * — moves between its items on the arrow keys.
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
  const panelRef = useRef<HTMLDivElement>(null);

  /**
   * Only a real menu gets arrow navigation.
   *
   * The settings popover passes role="group" because it holds radios and
   * checkboxes, and those own the arrow keys themselves — a segmented control
   * moves between its options on Left/Right, and stealing Up/Down there would
   * break the pattern this component is trying to honour.
   */
  const isMenu = panelRole === 'menu';

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!anchorRef.current?.contains(event.target as Node)) setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (!isMenu) return;

      // The trigger says aria-haspopup="menu" and every entry says
      // role="menuitem". That markup promises Up and Down move between them;
      // without this the promise was false and Tab was the only way through.
      const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
      if (!keys.includes(event.key)) return;

      const entries = [
        ...(panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []),
      ];
      if (entries.length === 0) return;
      event.preventDefault();

      const last = entries.length - 1;
      // -1 while focus is still on the trigger, which is what makes Down open
      // at the first entry and Up wrap to the last.
      const at = entries.indexOf(document.activeElement as HTMLElement);

      const next =
        event.key === 'Home' ? 0
        : event.key === 'End' ? last
        : event.key === 'ArrowDown' ? (at >= last ? 0 : at + 1)
        : at <= 0 ? last
        : at - 1;

      entries[next]!.focus();
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, isMenu]);

  /**
   * Opening moves focus onto the first entry, which is what makes the arrow
   * keys reachable at all: a button opened with Enter leaves focus on the
   * trigger, and a menu you must Tab into is the thing being fixed.
   */
  useEffect(() => {
    if (!open || !isMenu) return;
    panelRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open, isMenu]);

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
          ref={panelRef}
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
