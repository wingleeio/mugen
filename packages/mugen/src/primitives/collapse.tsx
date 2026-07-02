import {
  useCallback,
  useContext,
  useSyncExternalStore,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import { markPrimitive, type MeasureContext } from './core';
import { measureChildren, naturalWidthOf, toChildArray } from '../walker';
import { currentSession } from '../session';
import { RowScopeContext } from '../row-scope';
import type { MugenEasing } from '../state/clock';

export interface CollapseProps {
  /**
   * Names this collapse's animation slot — must be unique within the row (two
   * collapses in one row need different ids; derive one from your data).
   */
  id: string;
  open: boolean;
  /** Milliseconds per toggle. Default 200. `0` snaps (as does reduced motion). */
  duration?: number;
  /** Default `'ease-out'`. */
  easing?: MugenEasing;
  /** Measured like a `VStack`'s children (a vertical stack, no gap/padding). */
  children?: ReactNode;
}

const slotKeyOf = (id: string) => `@collapse:${id}`;

/**
 * The render half: a clipped column pinned to the tween's current height. It
 * subscribes to its row's version itself, so it repaints every animation frame
 * even when an ancestor element is memo-stable (`useMugenMemo`) and React
 * bails out of re-rendering the subtree — the measure walk is kept fresh the
 * same way via the row's slot epoch.
 */
function CollapseComponent(props: CollapseProps): ReactElement {
  const { id, open, duration: _d, easing: _e, children, ...rest } = props;
  const ctx = useContext(RowScopeContext);
  const subscribe = useCallback(
    (cb: () => void) => (ctx ? ctx.host.subscribeRow(ctx.rowKey, cb) : () => {}),
    [ctx],
  );
  const getVersion = useCallback(() => (ctx ? ctx.host.rowVersion(ctx.rowKey) : 0), [ctx]);
  useSyncExternalStore(subscribe, getVersion, getVersion);

  // The tween's current value — what the walk measured this row with. Outside
  // a list (no scope/slot) degrade to a static open/closed box.
  const value = ctx ? ctx.host.tweenValue(ctx.rowKey, slotKeyOf(id)) : null;
  const height = value ?? (open ? undefined : 0);
  const style: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    margin: 0,
    border: 0,
    boxSizing: 'border-box',
    minWidth: 0,
    // The clip is what keeps paint inside the computed box mid-flight: the
    // children render at full size and reveal as the height moves.
    overflow: 'hidden',
    ...(height != null ? { height: `${height}px` } : null),
  };
  return (
    <div {...rest} data-mugen-collapse={id} style={style}>
      {children}
    </div>
  );
}
CollapseComponent.displayName = 'Collapse';

function measureCollapse(props: Record<string, unknown>, ctx: MeasureContext): number {
  const p = props as unknown as CollapseProps;
  // The children's natural height is knowable before the animation starts —
  // that's the walker's whole trick — so the open target needs no
  // double-render dance.
  const natural = measureChildren(p.children, ctx);
  const session = currentSession();
  // No ambient session (a top/bottom slot, a bare heightOf call): no animation
  // state to keep — measure as a static open/closed box.
  if (!session) return p.open ? natural : 0;
  return session.host.collapseTween(session.rowKey, slotKeyOf(p.id), p.open, natural, {
    duration: p.duration,
    easing: p.easing,
  });
}

/**
 * An animated disclosure. Toggling `open` tweens the row's *committed* height
 * between 0 and the children's measured natural height on the list's animation
 * clock: each frame the row re-measures with the tween's value and paints a
 * clipped box of exactly that height, so offsets, total scroll height and
 * paint stay in agreement mid-flight — rows below slide, the scrollbar tracks,
 * and scroll anchoring keeps above-the-fold animations from shifting the
 * viewport.
 *
 * Content that changes size *while* open (streaming text) snaps rather than
 * animates — only `open` toggles animate — so it composes with
 * `stickToBottom`'s spring instead of fighting it. Honors
 * `prefers-reduced-motion` by snapping.
 */
export const Collapse = markPrimitive(CollapseComponent as (props: CollapseProps) => ReactElement, {
  name: 'Collapse',
  measure: measureCollapse,
  naturalWidth: (props, ctx) => {
    // A vertical stack's natural width: the widest child (null if unknowable).
    let max = 0;
    for (const child of toChildArray((props as unknown as CollapseProps).children)) {
      const w = naturalWidthOf(child, ctx);
      if (w == null) return null;
      max = Math.max(max, w);
    }
    return max;
  },
});
