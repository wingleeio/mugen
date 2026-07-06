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
 * *its* rules, which pretext does not model — so instead of trusting it, the
 * native `Text` paints pretext's **materialized lines**: each measured line is
 * its own single-line `<Text>` pinned at `i × lineHeight` inside a box of
 * exactly the measured height. The same prepared handle feeds the walker's
 * height and this paint, so they cannot disagree — the web invariant,
 * re-established on RN's terms.
 *
 * Lines never re-wrap natively (`numberOfLines={1}`, clipped): a sub-pixel
 * advance disagreement between pretext-native's font tables and the platform
 * shaper degrades to a clipped glyph edge, never to a reflow.
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
    return { lines, height, width };
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
      {laidOut.lines.map((line, i) => (
        <RNText
          key={i}
          numberOfLines={1}
          ellipsizeMode="clip"
          selectable={props.selectable}
          style={[
            {
              position: 'absolute',
              top: i * r.lineHeight,
              left: 0,
              right: 0,
            },
            lineStyle,
            props.style,
          ]}
        >
          {line.text}
        </RNText>
      ))}
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
