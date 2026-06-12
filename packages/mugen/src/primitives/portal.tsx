import { Fragment, createElement, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { markPrimitive } from './core';

/** @deprecated See {@link Portal}'s deprecation note — use `Escape` instead. */
export interface PortalProps {
  children: ReactNode;
  /**
   * Where to portal the children. Defaults to `document.body`. Pass `null` to
   * render them inline (still measured as 0 — for an element you position
   * yourself with `position: absolute` inside a `relative` ancestor).
   */
  container?: Element | DocumentFragment | null;
}

function PortalComponent(props: PortalProps): ReactElement | null {
  // No DOM to portal into on the server; the row has no out-of-flow content there.
  if (typeof document === 'undefined') return null;
  if (props.container === null) return createElement(Fragment, null, props.children);
  return createPortal(props.children, props.container ?? document.body);
}
PortalComponent.displayName = 'Portal';

/**
 * Marks a subtree as **out of the row's flow**: it contributes no height and is
 * rendered elsewhere (portaled to `document.body` by default). Its `measure()`
 * returns 0 *without recursing*, so the walker never touches the children —
 * which means, uniquely, they may be arbitrary non-primitive React (a Radix
 * popover, a floating-ui panel, anything). The trigger that anchors such an
 * overlay stays in the row and is measured normally; only the portaled half
 * goes inside `Portal`.
 *
 * @deprecated Use `Escape` instead: an in-flow box with a declared height whose
 * children are never walked. Overlay libraries (Radix, shadcn/ui) portal their
 * own floating content out of the row, so a whole tooltip/popover/menu — trigger
 * included — drops inside an `Escape`; a separate measured-as-0 half is no
 * longer needed. `Portal` (and `@wingleeio/mugen-ui`, which builds on it) keeps
 * working but will be removed in a future major.
 */
export const Portal = markPrimitive(
  PortalComponent as (props: PortalProps) => ReactElement | null,
  {
    name: 'Portal',
    // Out of row flow → no height, and children are never walked (so the usual
    // "only primitives are measurable" rule does not apply inside a Portal).
    measure: () => 0,
    naturalWidth: () => 0,
    // Paints no flex item in the row, so boxes skip it when counting gaps and
    // distributing width.
    outOfFlow: true,
  },
);
