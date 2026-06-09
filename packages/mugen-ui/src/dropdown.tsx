import type React from 'react';
import { useCallback, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { createOverlayContext, createRoot, createTrigger, markZeroMeasure } from './internal/overlay';
import { AnchoredContent } from './internal/anchored';
import type { Align, Side } from './internal/position';

const { Ctx, useOverlay } = createOverlayContext('Dropdown');

export interface DropdownProps {
  children: ReactNode;
}

/** Root of a dropdown menu. */
const Dropdown = createRoot('Dropdown', Ctx);

/** Click toggles the menu; measured normally (real row space). */
const Trigger = createTrigger('Dropdown.Trigger', useOverlay, (api) => ({
  onClick: (e: React.MouseEvent<HTMLElement>) => api.setOpen(!api.open, e.currentTarget),
}));

const ITEM_SELECTOR = '[role="menuitem"]:not([aria-disabled="true"])';

export interface DropdownContentProps {
  side?: Side;
  align?: Align;
  gap?: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * The menu surface — portaled, measured as 0. Focuses its first item on open and
 * provides arrow / Home / End roving focus; Escape and outside press dismiss it
 * (via `AnchoredContent`).
 */
const Content = markZeroMeasure(function Content(props: DropdownContentProps) {
  const api = useOverlay('Content');
  const menuRef = useRef<HTMLDivElement>(null);

  // Focus the first menu item once the menu opens (after it has positioned).
  useEffect(() => {
    if (!api.open) return;
    const id = requestAnimationFrame(() => {
      const first = menuRef.current?.querySelector<HTMLElement>(ITEM_SELECTOR);
      first?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [api.open]);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const menu = menuRef.current;
    if (!menu) return;
    const items = Array.from(menu.querySelectorAll<HTMLElement>(ITEM_SELECTOR));
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (e.key === 'ArrowDown') next = current < items.length - 1 ? current + 1 : 0;
    else if (e.key === 'ArrowUp') next = current > 0 ? current - 1 : items.length - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    if (next !== -1) {
      e.preventDefault();
      items[next]?.focus();
    }
  }, []);

  return (
    <AnchoredContent
      api={api}
      side={props.side ?? 'bottom'}
      align={props.align ?? 'start'}
      gap={props.gap ?? 6}
      role="menu"
      dismissable
      className={props.className}
      style={props.style}
    >
      <div ref={menuRef} onKeyDown={onKeyDown} style={{ display: 'contents' }}>
        {props.children}
      </div>
    </AnchoredContent>
  );
}, 'Dropdown.Content');

export interface DropdownItemProps {
  onSelect?: () => void;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/** A menu item. Selecting it runs `onSelect` and closes the menu. */
function Item(props: DropdownItemProps) {
  const api = useOverlay('Item');
  const select = () => {
    if (props.disabled) return;
    props.onSelect?.();
    api.setOpen(false);
  };
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      aria-disabled={props.disabled || undefined}
      disabled={props.disabled}
      onClick={select}
      // Hover moves focus, so the keyboard-focused and mouse-hovered item are
      // always the same one — only ever a single highlight.
      onMouseEnter={(e) => {
        if (!props.disabled) e.currentTarget.focus();
      }}
      className={props.className}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        cursor: props.disabled ? 'default' : 'pointer',
        ...props.style,
      }}
    >
      {props.children}
    </button>
  );
}
Item.displayName = 'Dropdown.Item';

const DropdownNamespace = Object.assign(Dropdown, { Trigger, Content, Item });
export { DropdownNamespace as Dropdown };
