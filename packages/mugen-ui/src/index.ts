/**
 * mugen-ui — measurable overlay primitives for mugen.
 *
 * Tooltips, popovers, dropdowns, and dialogs whose **trigger** is measured by
 * the virtualizer like any other primitive (it occupies real row space), while
 * their **content** lives in a `Portal` — measured as 0 and never walked, so it
 * can be arbitrary React. The trigger's footprint is measured for real (no
 * parallel "measure" description), so a row's height can't desync from what
 * paints. Positioning, dismissal, focus, and keyboard nav are handled here;
 * mugen core stays a pure measurement engine.
 *
 * Each widget is a compound component: `<Tooltip>` / `<Tooltip.Trigger>` /
 * `<Tooltip.Content>`, and likewise for `Popover`, `Dropdown`, `Dialog`.
 */

export { Tooltip } from './tooltip';
export type { TooltipProps, TooltipContentProps } from './tooltip';

export { Popover } from './popover';
export type { PopoverProps, PopoverContentProps } from './popover';

export { Dropdown } from './dropdown';
export type { DropdownProps, DropdownContentProps, DropdownItemProps } from './dropdown';

export { Dialog } from './dialog';
export type { DialogProps, DialogContentProps, DialogCloseProps } from './dialog';

// Shared types for positioning props.
export type { Side, Align } from './internal/position';
