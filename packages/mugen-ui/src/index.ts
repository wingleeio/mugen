/**
 * mugen-ui — measurable overlay primitives for mugen.
 *
 * @deprecated This package is deprecated in favour of mugen core's `Escape`
 * primitive. An `Escape` is an in-flow box with a declared height whose
 * children are never walked, so a complete off-the-shelf overlay — a shadcn/ui
 * or Radix Tooltip, Popover, DropdownMenu, or Dialog, *trigger included* —
 * drops straight into a row; those libraries portal their own floating content
 * out of the row, so it never touches mugen's layout. The split-trigger
 * machinery here is only still needed when a trigger's height must come from
 * measured, wrapping text. Everything below keeps working but will not receive
 * new features and will be removed in a future major.
 *
 * Tooltips, popovers, dropdowns, and dialogs whose **trigger** is measured by
 * the virtualizer like any other primitive (it occupies real row space), while
 * their **content** lives in a `Portal` — measured as 0 and never walked, so it
 * can be arbitrary React. Each widget is a compound component: `<Tooltip>` /
 * `<Tooltip.Trigger>` / `<Tooltip.Content>`, and likewise for `Popover`,
 * `Dropdown`, `Dialog`.
 */

/** @deprecated Use a shadcn/Radix Tooltip inside mugen's `Escape` primitive. */
export { Tooltip } from './tooltip';
export type { TooltipProps, TooltipContentProps } from './tooltip';

/** @deprecated Use a shadcn/Radix Popover inside mugen's `Escape` primitive. */
export { Popover } from './popover';
export type { PopoverProps, PopoverContentProps } from './popover';

/** @deprecated Use a shadcn/Radix DropdownMenu inside mugen's `Escape` primitive. */
export { Dropdown } from './dropdown';
export type { DropdownProps, DropdownContentProps, DropdownItemProps } from './dropdown';

/** @deprecated Use a shadcn/Radix Dialog inside mugen's `Escape` primitive. */
export { Dialog } from './dialog';
export type { DialogProps, DialogContentProps, DialogCloseProps } from './dialog';

// Shared types for positioning props.
export type { Side, Align } from './internal/position';
