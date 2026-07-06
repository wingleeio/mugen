import { useCallback, useContext, useSyncExternalStore, type ReactElement, type ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import {
  markPrimitive,
  getPrimitiveDef,
  Collapse as WebCollapse,
  RowScopeContext,
  type MugenEasing,
} from '@wingleeio/mugen/native-core';

export interface CollapseProps {
  /** Names this collapse's animation slot — unique within the row. */
  id: string;
  open: boolean;
  /** Milliseconds per toggle. Default 200. `0` snaps (as does reduced motion). */
  duration?: number;
  /** Default `'ease-out'`. */
  easing?: MugenEasing;
  /** Measured like a `VStack`'s children (a vertical stack, no gap/padding). */
  children?: ReactNode;
}

const webCollapseDef = getPrimitiveDef(WebCollapse)!;

/**
 * The native render half — same shape as the web: a clipped column pinned to
 * the tween's current height, subscribing to its own row version so it repaints
 * every animation frame even under memo-stable ancestors. The tween itself
 * lives in the shared engine (`collapseTween` on the instance), driven by the
 * shared `AnimationClock` — `requestAnimationFrame` exists on React Native, so
 * the whole animation path is the web code, untouched.
 */
function CollapseComponent(props: CollapseProps): ReactElement {
  const { id, open, children } = props;
  const ctx = useContext(RowScopeContext);
  const subscribe = useCallback(
    (cb: () => void) => (ctx ? ctx.host.subscribeRow(ctx.rowKey, cb) : () => {}),
    [ctx],
  );
  const getVersion = useCallback(() => (ctx ? ctx.host.rowVersion(ctx.rowKey) : 0), [ctx]);
  useSyncExternalStore(subscribe, getVersion, getVersion);

  const value = ctx ? ctx.host.tweenValue(ctx.rowKey, `@collapse:${id}`) : null;
  const height = value ?? (open ? undefined : 0);
  const style: ViewStyle = {
    flexDirection: 'column',
    overflow: 'hidden',
    ...(height != null ? { height } : null),
  };
  // Children inherit the ambient WidthContext unchanged — a Collapse is
  // measured like a padding-less VStack, so the width math is a pass-through.
  return <View style={style}>{children}</View>;
}
CollapseComponent.displayName = 'Collapse';

/**
 * An animated disclosure — measure half shared with the web `Collapse`
 * (`collapseTween` on the row's slot store), so offsets, total scroll height
 * and paint agree mid-flight, and it composes with `stickToBottom` exactly as
 * on the web.
 */
export const Collapse = markPrimitive(CollapseComponent as (props: CollapseProps) => ReactElement, {
  name: 'Collapse',
  measure: webCollapseDef.measure,
  naturalWidth: webCollapseDef.naturalWidth,
});
