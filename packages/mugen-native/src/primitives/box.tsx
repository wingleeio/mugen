import { useContext, type ReactElement, type ReactNode } from 'react';
import { View, type FlexAlignType, type StyleProp, type ViewStyle } from 'react-native';
import {
  getPrimitiveDef,
  markPrimitive,
  definePrimitive as defineWebPrimitive,
  distribute,
  toChildArray,
  isOutOfFlow,
  measureNode,
  TextDefaultsContext,
  type BoxDirection,
  type MeasurableDef,
  type MeasureContext,
} from '@wingleeio/mugen/native-core';
import { WidthContext } from '../width-context';

/**
 * The layout props a native box derives its height from — identical vocabulary
 * to the web (`gap`, `padding`, `width`, `height`, `align`, `justify`), because
 * the *measure* halves are literally the web ones (`getPrimitiveDef(VStack)`).
 * Only the render half differs: RN `View` flexbox instead of CSS flexbox, and
 * the available width is threaded through `WidthContext` with the same
 * arithmetic the measure used, so `Text` below can paint pretext's lines.
 */
export interface NativeBoxProps {
  children?: ReactNode;
  /** Gap between children, in px (chrome in the height). */
  gap?: number;
  /** Uniform padding, in px (chrome on both axes). */
  padding?: number;
  /** Declared width, in px — lays out as a fixed sibling in an `HStack`. */
  width?: number;
  /** Declared height, in px. When set, the box's height is this, not its children's. */
  height?: number;
  align?: 'flex-start' | 'flex-end' | 'center' | 'stretch' | 'baseline';
  justify?:
    | 'flex-start'
    | 'flex-end'
    | 'center'
    | 'space-between'
    | 'space-around'
    | 'space-evenly';
  /**
   * Extra styles, colors/borders-as-you-own-it. Padding/margin/sizing here can
   * desync paint from the measured height — same contract as the web `style`.
   */
  style?: StyleProp<ViewStyle>;
}

export interface NativePrimitiveComponent {
  (props: NativeBoxProps): ReactElement | null;
  displayName: string;
}

/**
 * The render halves borrow their measure from a web box of the same direction —
 * one source of truth for the height math (`measureBox`/`naturalBoxWidth` in
 * @wingleeio/mugen). The web components' *render* halves are never invoked.
 */
const webVStackDef = getPrimitiveDef(defineWebPrimitive('div', { name: 'VStack' }))!;
const webHStackDef = getPrimitiveDef(
  defineWebPrimitive('div', { direction: 'horizontal', name: 'HStack' }),
)!;

function useRenderMeasureContext(width: number): MeasureContext {
  const defaults = useContext(TextDefaultsContext);
  return {
    width,
    defaults,
    measure: (node, w) => measureNode(node, w, defaults),
  };
}

function NativeBox(props: NativeBoxProps, direction: BoxDirection): ReactElement {
  const width = useContext(WidthContext);
  const pad = props.padding ?? 0;
  const gap = props.gap ?? 0;
  // Mirror the walker: children see `ctx.width - 2 * padding`. (The walker
  // threads the *parent's* width even into declared-width children — the paint
  // clamps via maxWidth exactly like the web render does.)
  const inner = Math.max(0, width - 2 * pad);
  const ctx = useRenderMeasureContext(inner);

  const outer: ViewStyle = {
    flexDirection: direction === 'horizontal' ? 'row' : 'column',
    padding: pad,
    alignItems: (props.align as FlexAlignType | undefined) ?? undefined,
    justifyContent: props.justify,
    ...(gap !== 0 ? { gap } : null),
    ...(props.width != null
      ? { flexGrow: 0, flexShrink: 0, width: Math.min(props.width, width || props.width) }
      : null),
    ...(props.height != null ? { height: props.height, overflow: 'hidden' } : null),
  };

  if (direction === 'horizontal') {
    // A row splits the inner width across children with the same `distribute`
    // the measure ran; each child is wrapped in a fixed-width cell and told its
    // width via context, so a wrapping <Text> inside breaks exactly where the
    // measured height said it would.
    const kids = toChildArray(props.children).filter((k) => !isOutOfFlow(k));
    const widths = distribute(kids, inner, gap, ctx);
    return (
      <View style={[outer, props.style]}>
        {kids.map((kid, i) => {
          const w = widths[i] ?? inner;
          // Prefer the child's own key for reconciliation; fall back to index.
          const key =
            kid != null && typeof kid === 'object' && 'key' in kid && kid.key != null
              ? kid.key
              : i;
          return (
            <View key={key} style={{ width: w, flexGrow: 0, flexShrink: 0 }}>
              <WidthContext.Provider value={w}>{kid}</WidthContext.Provider>
            </View>
          );
        })}
      </View>
    );
  }

  return (
    <View style={[outer, props.style]}>
      <WidthContext.Provider value={inner}>{props.children}</WidthContext.Provider>
    </View>
  );
}

export interface DefineNativePrimitiveOptions {
  /** Lay children out vertically (default) or horizontally. */
  direction?: BoxDirection;
  /** Display name for devtools / measure errors. */
  name?: string;
}

/**
 * Make a measurable native primitive — a layout `View` with the same measurable
 * chrome props as the web (`gap`, `padding`, `width`, `height`). The measure
 * half is the web implementation, imported — not re-derived — so native heights
 * can never drift from the shared math.
 */
export function definePrimitive(
  options: DefineNativePrimitiveOptions = {},
): NativePrimitiveComponent {
  const direction = options.direction ?? 'vertical';
  const name = options.name ?? (direction === 'horizontal' ? 'HStack' : 'VStack');
  const webDef: MeasurableDef = direction === 'horizontal' ? webHStackDef : webVStackDef;
  const Component = ((props: NativeBoxProps) =>
    NativeBox(props, direction)) as NativePrimitiveComponent;
  Component.displayName = name;
  return markPrimitive(Component, {
    name,
    measure: webDef.measure,
    naturalWidth: webDef.naturalWidth,
  });
}

/** Vertical layout box. */
export const VStack = definePrimitive({ name: 'VStack' });

/** Horizontal layout box. */
export const HStack = definePrimitive({ direction: 'horizontal', name: 'HStack' });

export type VStackProps = NativeBoxProps;
export type HStackProps = NativeBoxProps;
