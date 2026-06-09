import { useRef, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { Portal } from '@wingleeio/mugen';
import { usePosition, type Align, type Side } from './position';
import { useDismiss } from './dismiss';
import type { OverlayApi } from './overlay';

export interface AnchoredContentProps {
  api: OverlayApi;
  side?: Side;
  align?: Align;
  gap?: number;
  /** ARIA role for the floating element (e.g. `tooltip`, `dialog`, `menu`). */
  role?: string;
  /** Close on Escape / outside press. Tooltips leave this off (they close on pointer-leave). */
  dismissable?: boolean;
  /** `none` lets clicks pass through — right for tooltips. */
  pointerEvents?: CSSProperties['pointerEvents'];
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * The portaled half of an anchored overlay (tooltip / popover / dropdown). It is
 * wrapped in `Portal`, so the row's measure pass sees height 0 and never walks
 * the content — it may be arbitrary React. Positioned with `position: fixed`
 * against the trigger's rect, kept hidden until it has measured once.
 */
export function AnchoredContent(props: AnchoredContentProps): ReactElement | null {
  const { api, side, align, gap, role, dismissable, pointerEvents, className, style, children } =
    props;
  const ref = useRef<HTMLDivElement>(null);
  const coords = usePosition(api.open, api.anchor, ref, { side, align, gap });
  useDismiss(dismissable ? api.open : false, () => api.setOpen(false), {
    anchor: api.anchor,
    content: ref,
  });

  if (!api.open) return null;
  return (
    <Portal>
      <div
        ref={ref}
        role={role}
        style={{
          position: 'fixed',
          top: coords?.top ?? 0,
          left: coords?.left ?? 0,
          visibility: coords ? 'visible' : 'hidden',
          pointerEvents,
          ...style,
        }}
        className={className}
      >
        {children}
      </div>
    </Portal>
  );
}
