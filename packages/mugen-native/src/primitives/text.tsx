import { useContext, useMemo, type ReactElement } from 'react';
import { Text as RNText, View, type StyleProp, type TextStyle } from 'react-native';
import { layoutWithLines } from '@chenglou/pretext';
import {
  getPrimitiveDef,
  markPrimitive,
  resolveText,
  prepareTextSegments,
  naturalWidth,
  fontEpoch,
  Text as WebText,
  TextDefaultsContext,
  type TextProps as WebTextProps,
  type Font,
  type WhiteSpaceMode,
  type WordBreakMode,
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
  const r = resolveText(props as unknown as WebTextProps, defaults);
  const text = props.children;
  const epoch = fontEpoch();

  const laidOut = useMemo(() => {
    if (rowWidth <= 0 || typeof text !== 'string') return null;
    const width = props.shrink
      ? Math.min(rowWidth, Math.ceil(naturalWidth(text, r.font, r.opts)))
      : rowWidth;
    const prepared = prepareTextSegments(text, r.font, r.opts);
    // Mirrors `layout()`'s break decisions — the exact call the measure made.
    const { lines, height } = layoutWithLines(prepared, width, r.lineHeight);
    // Join at pretext's break points with hard newlines: RN renders exactly
    // these lines, in one node, without re-choosing any breaks.
    return { text: lines.map((l) => l.text).join('\n'), count: lines.length, height, width };
    // `epoch` invalidates when fonts (re)register and metrics change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, r.font, r.lineHeight, r.letterSpacing, r.whiteSpace, r.wordBreak, rowWidth, props.shrink, epoch]);

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
 * `@wingleeio/mugen` computes identical heights here.
 */
export const Text = markPrimitive(TextComponent as (props: TextProps) => ReactElement | null, {
  name: 'Text',
  measure: webTextDef.measure,
  naturalWidth: webTextDef.naturalWidth,
});
