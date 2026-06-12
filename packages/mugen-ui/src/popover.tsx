import type React from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createOverlayContext, createRoot, createTrigger, markZeroMeasure } from './internal/overlay';
import { AnchoredContent } from './internal/anchored';
import type { Align, Side } from './internal/position';

const { Ctx, useOverlay } = createOverlayContext('Popover');

export interface PopoverProps {
  children: ReactNode;
}

/** Root of a click-toggled, anchored popover. */
const Popover = createRoot('Popover', Ctx);

/** Click toggles the popover; measured normally (real row space). */
const Trigger = createTrigger('Popover.Trigger', useOverlay, (api) => ({
  onClick: (e: React.MouseEvent<HTMLElement>) => api.setOpen(!api.open, e.currentTarget),
}));

export interface PopoverContentProps {
  side?: Side;
  align?: Align;
  gap?: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * The panel — portaled, measured as 0, arbitrary React inside. Dismisses on
 * Escape or an outside press.
 */
const Content = markZeroMeasure(function Content(props: PopoverContentProps) {
  const api = useOverlay('Content');
  return (
    <AnchoredContent
      api={api}
      side={props.side ?? 'bottom'}
      align={props.align ?? 'start'}
      gap={props.gap ?? 6}
      role="dialog"
      dismissable
      className={props.className}
      style={props.style}
    >
      {props.children}
    </AnchoredContent>
  );
}, 'Popover.Content');

/** @deprecated Use a shadcn/Radix Popover inside mugen's `Escape` primitive. */
const PopoverNamespace = Object.assign(Popover, { Trigger, Content });
export { PopoverNamespace as Popover };
