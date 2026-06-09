import type React from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createOverlayContext, createRoot, createTrigger, markZeroMeasure } from './internal/overlay';
import { AnchoredContent } from './internal/anchored';
import type { Align, Side } from './internal/position';

const { Ctx, useOverlay } = createOverlayContext('Tooltip');

export interface TooltipProps {
  children: ReactNode;
}

/** Root of a tooltip. Holds the open-state for its trigger and content. */
const Tooltip = createRoot('Tooltip', Ctx);

/**
 * The hover/focus target — measured normally, so it occupies real row space. Its
 * children must be mugen primitives (they get walked).
 */
const Trigger = createTrigger('Tooltip.Trigger', useOverlay, (api) => ({
  onPointerEnter: (e: React.PointerEvent<HTMLElement>) => api.setOpen(true, e.currentTarget),
  onPointerLeave: () => api.setOpen(false),
  onFocus: (e: React.FocusEvent<HTMLElement>) => api.setOpen(true, e.currentTarget),
  onBlur: () => api.setOpen(false),
}));

export interface TooltipContentProps {
  side?: Side;
  align?: Align;
  gap?: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * The popover bubble — portaled and measured as 0, so it adds no row height and
 * may be any React (plain HTML, not mugen primitives). Click-through, and closes
 * with the trigger's pointer-leave rather than on outside press.
 */
const Content = markZeroMeasure(function Content(props: TooltipContentProps) {
  const api = useOverlay('Content');
  return (
    <AnchoredContent
      api={api}
      side={props.side ?? 'top'}
      align={props.align ?? 'center'}
      gap={props.gap ?? 6}
      role="tooltip"
      pointerEvents="none"
      className={props.className}
      style={props.style}
    >
      {props.children}
    </AnchoredContent>
  );
}, 'Tooltip.Content');

const TooltipNamespace = Object.assign(Tooltip, { Trigger, Content });
export { TooltipNamespace as Tooltip };
