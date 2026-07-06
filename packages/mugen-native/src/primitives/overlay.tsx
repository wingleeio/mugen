import type { ReactElement, ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { markPrimitive } from '@wingleeio/mugen/native-core';

export interface OverlayProps {
  /**
   * Painted absolutely over the parent box (children are **never walked**).
   * Purely decorative by contract: an Overlay measures 0 and is out-of-flow,
   * so it can never change a row's height — the RN analog of the web
   * renderers' inset-box-shadow chrome (blockquote rules, table rings).
   */
  children?: ReactNode;
  /** Extra styles merged over the absolute-fill default. */
  style?: StyleProp<ViewStyle>;
  /** Whether the overlay intercepts touches. Default 'none'. */
  pointerEvents?: 'none' | 'auto' | 'box-none' | 'box-only';
}

function OverlayComponent(props: OverlayProps): ReactElement {
  return (
    <View
      pointerEvents={props.pointerEvents ?? 'none'}
      style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }, props.style]}
    >
      {props.children}
    </View>
  );
}
OverlayComponent.displayName = 'Overlay';

/**
 * Height-neutral decoration over a box. Out-of-flow for the walker (like the
 * deprecated web `Portal`): boxes skip it when counting gaps and distributing
 * width, and it contributes zero height — paint chrome (rules, rings, badges)
 * without desyncing the measure.
 */
export const Overlay = markPrimitive(OverlayComponent as (props: OverlayProps) => ReactElement, {
  name: 'Overlay',
  measure: () => 0,
  outOfFlow: true,
});
