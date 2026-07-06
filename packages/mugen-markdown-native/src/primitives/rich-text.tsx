import { useContext, useMemo, type ReactElement, type ReactNode } from 'react';
import { Linking, Text as RNText, View, type TextStyle } from 'react-native';
import {
  walkRichInlineLineRanges,
  materializeRichInlineLineRange,
  type RichInlineLineRange,
} from '@chenglou/pretext/rich-inline';
import {
  getPrimitiveDef,
  markPrimitive,
  fontEpoch,
  type Font,
} from '@wingleeio/mugen/native-core';
import {
  RichText as WebRichText,
  segmentItems,
  prepareCached,
  resolveRunFont,
  type RichTextProps as WebRichTextProps,
  type RichTextRun,
} from '@wingleeio/mugen-markdown/native-core';
import { WidthContext, fontShorthandToTextStyle } from '@wingleeio/mugen-native';
import { FadeLine } from './fade';

export type { RichTextRun };

export interface RichTextProps {
  /** The inline runs to flow together. */
  runs: RichTextRun[];
  /** Line height in px — the height of every wrapped line. Required. */
  lineHeight: number;
  /** Fallback font for runs that don't set their own. */
  font?: Font;
  color?: string;
  align?: 'left' | 'right' | 'center' | 'justify' | 'start' | 'end';
  selectable?: boolean;
}

const webDef = getPrimitiveDef(WebRichText)!;

/** Map a CSS text-decoration string onto RN's textDecorationLine. */
function decorationLine(decoration: string | undefined): TextStyle['textDecorationLine'] {
  if (decoration == null) return undefined;
  const underline = decoration.includes('underline');
  const strike = decoration.includes('line-through');
  if (underline && strike) return 'underline line-through';
  if (underline) return 'underline';
  if (strike) return 'line-through';
  return undefined;
}

function alignOffset(
  align: RichTextProps['align'],
  width: number,
  lineWidth: number,
): number {
  if (align === 'center') return Math.max(0, (width - lineWidth) / 2);
  if (align === 'right' || align === 'end') return Math.max(0, width - lineWidth);
  return 0;
}

interface PaintedFragment {
  key: string;
  left: number;
  top: number;
  run: RichTextRun;
  text: string;
  width: number;
}

/**
 * The native render half of `RichText`.
 *
 * The web version renders spans and lets the browser wrap them — legitimate
 * there because pretext models the browser's breaker. React Native's breaker is
 * CoreText/Minikin, which pretext does not model, so instead the native version
 * paints pretext's **own geometry**: every line is walked
 * (`walkRichInlineLineRanges`) from the exact prepared handles the measure
 * counted lines on, then materialized into fragments carrying text, collapsed
 * inter-item gaps, and occupied widths. Each fragment paints as an absolutely
 * positioned single-line `<Text>` at pretext's x/y — the native shaper decides
 * nothing, so the painted block is `lines × lineHeight` by construction.
 */
function RichTextComponent(props: RichTextProps): ReactElement | null {
  const width = useContext(WidthContext);
  const epoch = fontEpoch();
  const { runs, lineHeight } = props;

  const painted = useMemo(() => {
    if (width <= 0 || runs.length === 0) return null;
    const segments = segmentItems(runs, props.font);
    const hasText = segments.some((s) => s.items.length > 0);
    const hasBreak = runs.some((r) => r.break);
    if (!hasText && !hasBreak) return null;

    const fragments: PaintedFragment[] = [];
    let top = 0;
    for (let si = 0; si < segments.length; si++) {
      const seg = segments[si]!;
      if (seg.items.length === 0) {
        top += lineHeight; // blank line (hard break) — measured as one line
        continue;
      }
      const prepared = prepareCached(seg.items);
      const ranges: RichInlineLineRange[] = [];
      walkRichInlineLineRanges(prepared, Math.max(0, width), (r) => ranges.push(r));
      if (ranges.length === 0) {
        top += lineHeight; // mirror the measure's `max(1, lineCount)`
        continue;
      }
      for (let li = 0; li < ranges.length; li++) {
        const line = materializeRichInlineLineRange(prepared, ranges[li]!);
        let x = alignOffset(props.align, width, line.width);
        for (let fi = 0; fi < line.fragments.length; fi++) {
          const frag = line.fragments[fi]!;
          x += frag.gapBefore;
          const run = seg.runs[frag.itemIndex];
          if (run == null) continue;
          fragments.push({
            key: `${si}:${li}:${fi}`,
            left: x,
            top,
            run,
            text: frag.text,
            width: frag.occupiedWidth,
          });
          x += frag.occupiedWidth;
        }
        top += lineHeight;
      }
    }
    return { fragments, height: top };
    // `epoch` invalidates when fonts (re)register and metrics change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs, props.font, props.align, lineHeight, width, epoch]);

  if (painted === null) return null;

  const children: ReactNode[] = painted.fragments.map((f) => {
    const run = f.run;
    if (run.advance != null) {
      // Inline box — paint the caller's content inside exactly the reserved
      // advance, clipped; the line's height is owned by the flow, as on the web.
      return (
        <View
          key={f.key}
          style={{
            position: 'absolute',
            left: f.left,
            top: f.top,
            width: run.advance,
            height: props.lineHeight,
            overflow: 'hidden',
            justifyContent: 'center',
          }}
        >
          {run.content}
        </View>
      );
    }
    const style: TextStyle = {
      ...fontShorthandToTextStyle(resolveRunFont(run, props.font)),
      lineHeight: props.lineHeight,
      ...(run.letterSpacing != null ? { letterSpacing: run.letterSpacing } : null),
      ...(run.color != null
        ? { color: run.color }
        : props.color != null
          ? { color: props.color }
          : null),
      ...(run.background != null ? { backgroundColor: run.background } : null),
      ...(decorationLine(run.decoration) != null
        ? { textDecorationLine: decorationLine(run.decoration) }
        : null),
    };
    const href = run.href;
    const onPress =
      (run.onClick as (() => void) | undefined) ??
      (href != null ? () => void Linking.openURL(href).catch(() => {}) : undefined);
    return (
      <FadeLine key={f.key}>
        <RNText
          numberOfLines={1}
          ellipsizeMode="clip"
          selectable={props.selectable}
          onPress={onPress}
          style={[{ position: 'absolute', left: f.left, top: f.top }, style]}
        >
          {f.text}
        </RNText>
      </FadeLine>
    );
  });

  return <View style={{ height: painted.height }}>{children}</View>;
}
RichTextComponent.displayName = 'RichText';

/**
 * Measured exactly like the web `RichText` — the measure half *is* the web one
 * (same segment items, same prepared-handle cache), so markdown authored for
 * the web computes identical heights here.
 */
export const RichText = markPrimitive(
  RichTextComponent as (props: RichTextProps) => ReactElement | null,
  {
    name: 'RichText',
    measure: webDef.measure,
    naturalWidth: webDef.naturalWidth,
  },
);

export { clearRichTextCache, measureInline } from '@wingleeio/mugen-markdown/native-core';

// The dispatcher's injection seam expects the web prop type; structurally the
// native props are a subset (no style/className), so this cast is sound for
// everything the dispatcher constructs.
export const RichTextForDispatcher = RichText as unknown as (
  props: WebRichTextProps,
) => ReactElement | null;
