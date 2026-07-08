import { useContext, useMemo, type ReactElement } from 'react';
import { Text as RNText, View, type StyleProp, type TextStyle } from 'react-native';
import { layoutWithLines } from '@wingleeio/pretext-core';
import {
  getPrimitiveDef,
  markPrimitive,
  resolveText,
  prepareTextSegments,
  naturalWidth,
  fontEpoch,
  currentSession,
  Text as WebText,
  TextDefaultsContext,
  RowScopeContext,
  type TextProps as WebTextProps,
  type Font,
  type WhiteSpaceMode,
  type WordBreakMode,
  type MeasureContext,
} from '@wingleeio/mugen/native-core';
import { WidthContext } from '../width-context';
import { fontShorthandToTextStyle } from '../font-style';

export interface TextProps {
  children: string;
  /** Font shorthand (`"600 15px Inter"`) — falls back to the list default. */
  font?: Font;
  lineHeight?: number;
  letterSpacing?: number;
  whiteSpace?: WhiteSpaceMode;
  wordBreak?: WordBreakMode;
  color?: string;
  /** Shrink-wrap to the text's natural width (bubble style), capped at the row width. */
  shrink?: boolean;
  /** Per-line text styles (color, textDecorationLine, …). Sizing keys desync at your own risk. */
  style?: StyleProp<TextStyle>;
  selectable?: boolean;
}

/** A paint-ready text layout: pretext's lines joined by hard newlines. */
export interface TextLayout {
  /** The laid-out text — lines joined with `\n` at pretext's break points. */
  text: string;
  /** Wrapped line count (the paint's `numberOfLines` cap). */
  count: number;
  /** Total laid-out height in px. */
  height: number;
  /** The width the layout was computed at (shrink resolves below the row width). */
  width: number;
}

/**
 * Optional app-provided layout store (mirror of `MugenHeightCache`, for the
 * PAINT side). Text layouts are pure functions of (text, font, options,
 * width, line-height) — computing one costs real milliseconds on Hermes
 * (segmentation dominates), so a first render of a never-painted transcript
 * used to pay ~2ms per text node. With a store attached, the layout is
 * computed exactly once per key: the MEASURE half primes it during any walk
 * (a boot warmer's sweep covers whole chats in the background), and an app
 * that persists entries makes first paints segmentation-free across
 * launches.
 *
 * `rowKey` (when known) names the row being laid out — an app can use it to
 * skip persisting volatile rows (streaming content re-lays-out every token).
 */
export interface MugenTextLayoutCache {
  get(key: string): TextLayout | undefined;
  set(key: string, value: TextLayout, rowKey?: string): void;
}

let layoutStore: MugenTextLayoutCache | null = null;

/** Attach (or detach) the shared text-layout store. */
export const setTextLayoutCache = (store: MugenTextLayoutCache | null): void => {
  layoutStore = store;
};

interface ResolvedText {
  font: Font;
  lineHeight: number;
  letterSpacing?: number;
  opts?: { whiteSpace?: WhiteSpaceMode; wordBreak?: WordBreakMode; letterSpacing?: number };
}

const layoutKeyOf = (text: string, r: ResolvedText, rowWidth: number, shrink: boolean): string =>
  `${rowWidth}|${r.lineHeight}|${r.font}|${r.opts?.whiteSpace ?? ''}|${r.opts?.wordBreak ?? ''}|${r.opts?.letterSpacing ?? ''}|${shrink ? 1 : 0}|${text}`;

/**
 * Compute (or fetch) the paint-ready layout for a text at a row width. The
 * single source for BOTH halves: the render consumes it, and the measure
 * half primes it — so any height walk leaves the paint layout behind it.
 */
const computeTextLayout = (
  text: string,
  r: ResolvedText,
  rowWidth: number,
  shrink: boolean,
  rowKey?: string,
): TextLayout => {
  const key = layoutStore !== null ? layoutKeyOf(text, r, rowWidth, shrink) : '';
  if (layoutStore !== null) {
    const hit = layoutStore.get(key);
    if (hit !== undefined) return hit;
  }
  const width = shrink
    ? Math.min(rowWidth, Math.ceil(naturalWidth(text, r.font, r.opts)))
    : rowWidth;
  const prepared = prepareTextSegments(text, r.font, r.opts);
  // Mirrors `layout()`'s break decisions — the exact call the measure made.
  const { lines, height } = layoutWithLines(prepared, width, r.lineHeight);
  // Join at pretext's break points with hard newlines: RN renders exactly
  // these lines, in one node, without re-choosing any breaks.
  const value: TextLayout = {
    text: lines.map((l) => l.text).join('\n'),
    count: lines.length,
    height,
    width,
  };
  layoutStore?.set(key, value, rowKey);
  return value;
};

const webTextDef = getPrimitiveDef(WebText)!;

/**
 * The native render half.
 *
 * On the web, measure and paint agree because pretext models the browser's own
 * line breaker. React Native's text engine (CoreText/Minikin) breaks lines by
 * *its* rules, which pretext does not model — so pretext computes the breaks
 * and this component hands RN the text ALREADY BROKEN, as one `<Text>` whose
 * lines are joined by hard `\n`. RN then never has to choose break points
 * (the source of the disagreement); it only lays out lines that already fit.
 *
 * Why one node and not one-per-line: a native `<Text>` is a Fabric view, and
 * rows mount during scroll. One node per wrapped line made a paragraph cost
 * ~10× the views of the web's single node, and mounting a screenful of them
 * on a fling exceeded a frame → bare canvas. One node per block matches the
 * web's mount cost, so plain windowing keeps up with a hard fling.
 *
 * Height stays exact via `numberOfLines = lines.length` inside a box of the
 * measured height with `overflow: hidden`: the same prepared handle feeds the
 * walker's height and this paint, and the cap guarantees a sub-pixel advance
 * disagreement (pretext font tables vs the platform shaper) can only clip a
 * glyph edge on the last line — never grow the box or reflow.
 */
function TextComponent(props: TextProps): ReactElement | null {
  const defaults = useContext(TextDefaultsContext);
  const rowWidth = useContext(WidthContext);
  const scope = useContext(RowScopeContext);
  const r = resolveText(props as unknown as WebTextProps, defaults);
  const text = props.children;
  const epoch = fontEpoch();
  const rowKey = scope?.rowKey;

  const laidOut = useMemo(() => {
    if (rowWidth <= 0 || typeof text !== 'string') return null;
    return computeTextLayout(text, r as unknown as ResolvedText, rowWidth, !!props.shrink, rowKey);
    // `epoch` invalidates when fonts (re)register and metrics change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, r.font, r.lineHeight, r.letterSpacing, r.whiteSpace, r.wordBreak, rowWidth, props.shrink, epoch, rowKey]);

  if (laidOut === null) return null;

  const lineStyle: TextStyle = {
    ...fontShorthandToTextStyle(r.font),
    lineHeight: r.lineHeight,
    ...(r.letterSpacing != null ? { letterSpacing: r.letterSpacing } : null),
    ...(props.color != null ? { color: props.color } : null),
  };

  return (
    <View
      style={{
        height: laidOut.height,
        overflow: 'hidden',
        ...(props.shrink ? { width: laidOut.width, flexGrow: 0, flexShrink: 0 } : null),
      }}
    >
      <RNText
        // Cap at the measured line count so RN can never grow the box: exact
        // height, clip-on-disagreement (the per-line invariant, one node).
        numberOfLines={laidOut.count}
        ellipsizeMode="clip"
        selectable={props.selectable}
        style={[{ position: 'absolute', top: 0, left: 0, right: 0 }, lineStyle, props.style]}
      >
        {laidOut.text}
      </RNText>
    </View>
  );
}
TextComponent.displayName = 'Text';

/**
 * Measured exactly like the web `Text` — the measure half *is* the web one
 * (same pretext caches, same options resolution), so a tree authored for
 * `@wingleeio/mugen` computes identical heights here. With a layout store
 * attached, measuring ALSO primes the paint layout at the same width the
 * walker used (the render threads the identical width by construction), so
 * a background height sweep leaves every text paint-ready.
 */
export const Text = markPrimitive(TextComponent as (props: TextProps) => ReactElement | null, {
  name: 'Text',
  measure(props: Record<string, unknown>, ctx: MeasureContext) {
    const h = webTextDef.measure(props, ctx);
    if (layoutStore !== null) {
      const p = props as unknown as TextProps;
      if (typeof p.children === 'string' && ctx.width > 0) {
        const r = resolveText(p as unknown as WebTextProps, ctx.defaults);
        computeTextLayout(
          p.children,
          r as unknown as ResolvedText,
          ctx.width,
          !!p.shrink,
          currentSession()?.rowKey,
        );
      }
    }
    return h;
  },
  naturalWidth: webTextDef.naturalWidth,
});
