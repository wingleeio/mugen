import { useContext, type ReactElement, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { markPrimitive } from '@wingleeio/mugen/native-core';
import { WidthContext } from '../width-context';

export interface EscapeProps {
  /**
   * Anything — the children are **never walked**, so the usual "only primitives
   * are measurable" rule does not apply inside an `Escape`. Arbitrary React
   * Native views, gesture handlers, charts, images: all fine. They render as
   * ordinary React inside the declared box.
   */
  children?: ReactNode;
  /**
   * The frame's height in px — authoritative for the walk *and* the paint.
   * Content taller than this is clipped, never silently re-measured: design
   * the children to the box you declare.
   */
  height: number;
  /** Declared width in px — lays out as a fixed sibling in an `HStack`. */
  width?: number;
  /** Unrestricted styles; the height pin beats them (same contract as the web). */
  style?: StyleProp<ViewStyle>;
}

function EscapeComponent(props: EscapeProps): ReactElement {
  const rowWidth = useContext(WidthContext);
  const frame: ViewStyle = {
    position: 'relative',
    overflow: 'hidden',
    height: props.height,
    ...(props.width != null
      ? {
          flexGrow: 0,
          flexShrink: 0,
          width: rowWidth > 0 ? Math.min(props.width, rowWidth) : props.width,
        }
      : null),
  };
  return <View style={[props.style, frame]}>{props.children}</View>;
}
EscapeComponent.displayName = 'Escape';

/**
 * A fixed-size box that **escapes the walker** — identical contract to the web
 * `Escape`: mugen reserves exactly the box you declare, children are never
 * walked, overflow clips, so the painted row can never desync from the
 * computed one.
 */
export const Escape = markPrimitive(EscapeComponent as (props: EscapeProps) => ReactElement, {
  name: 'Escape',
  measure: (props) => (props as unknown as EscapeProps).height,
  naturalWidth: (props) => (props as unknown as EscapeProps).width ?? null,
});
