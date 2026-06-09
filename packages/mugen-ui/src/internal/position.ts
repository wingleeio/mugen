import { useState, type RefObject } from 'react';
import { useIsoLayoutEffect } from './iso-layout-effect';

/** Which edge of the anchor the content sits on. */
export type Side = 'top' | 'bottom' | 'left' | 'right';
/** How the content aligns along the anchor's cross axis. */
export type Align = 'start' | 'center' | 'end';

export interface PositionOptions {
  side?: Side;
  align?: Align;
  /** Gap between anchor and content, in px. */
  gap?: number;
  /** Min distance kept from the viewport edge when clamping, in px. */
  viewportPadding?: number;
}

export interface Coords {
  top: number;
  left: number;
}

/**
 * Compute a fixed-position `{top, left}` for portaled content anchored to a DOM
 * element. The content is rendered with `position: fixed`, so viewport
 * coordinates from `getBoundingClientRect()` are used directly. Recomputed on
 * scroll/resize while open. Returns `null` until the content has measured once
 * (so the caller can keep it hidden for that first frame and avoid a flash at
 * 0,0).
 */
export function usePosition(
  open: boolean,
  anchor: HTMLElement | null,
  contentRef: RefObject<HTMLElement | null>,
  options: PositionOptions = {},
): Coords | null {
  const { side = 'bottom', align = 'center', gap = 6, viewportPadding = 8 } = options;
  const [coords, setCoords] = useState<Coords | null>(null);

  useIsoLayoutEffect(() => {
    if (!open || !anchor) {
      setCoords(null);
      return;
    }
    const update = () => {
      const content = contentRef.current;
      if (!content) return;
      const a = anchor.getBoundingClientRect();
      const cw = content.offsetWidth;
      const ch = content.offsetHeight;

      let top: number;
      if (side === 'top') top = a.top - ch - gap;
      else if (side === 'bottom') top = a.bottom + gap;
      else top = a.top + a.height / 2 - ch / 2; // left / right: center on the cross axis

      let left: number;
      if (side === 'left') left = a.left - cw - gap;
      else if (side === 'right') left = a.right + gap;
      else if (align === 'start') left = a.left;
      else if (align === 'end') left = a.right - cw;
      else left = a.left + a.width / 2 - cw / 2; // center

      // Clamp into the viewport so a popover near an edge stays fully visible.
      const maxLeft = window.innerWidth - cw - viewportPadding;
      const maxTop = window.innerHeight - ch - viewportPadding;
      left = Math.min(Math.max(viewportPadding, left), Math.max(viewportPadding, maxLeft));
      top = Math.min(Math.max(viewportPadding, top), Math.max(viewportPadding, maxTop));

      setCoords({ top, left });
    };

    update();
    // `true` (capture) so the listener fires for scrolls in any ancestor — the
    // mugen list scrolls an inner container, not the window.
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, anchor, contentRef, side, align, gap, viewportPadding]);

  return coords;
}
