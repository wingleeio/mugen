import { useContext, useMemo, type ReactElement, type ReactNode } from 'react';
import { Linking, Text as RNText, View, type TextStyle } from 'react-native';
import {
  walkRichInlineLineRanges,
  materializeRichInlineLineRange,
  type RichInlineLineRange,
} from '@wingleeio/pretext-core';
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
import { FadeLine, useInFadeScope } from './fade';
import {
  getMugenTextBlock,
  isMugenTextBlockEnabled,
  buildBlockSpec,
} from './mugen-text-block-bridge';

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

/**
 * Turn off every ligature class for code runs, so a programming font's
 * `===`/`!=`/`=>` render as the literal characters (the native analogue of the
 * web's `font-variant-ligatures: none`). Height-neutral: monospace advances
 * don't change under ligature substitution, and pretext-native measured without
 * ligatures anyway — this only changes which glyphs the shaper draws.
 */
export const NO_LIGATURES: TextStyle['fontVariant'] = [
  'no-common-ligatures',
  'no-discretionary-ligatures',
  'no-historical-ligatures',
  'no-contextual',
];

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

/** A run is collapsible into a shared multi-line `<Text>` only if it carries
 *  no per-fragment interaction or inline box (those must stay their own node)
 *  and it's the sole fragment of its line. Its style signature keys the merge. */
function collapseSignature(run: RichTextRun, fallbackFont: Font | undefined): string | null {
  if (run.advance != null || run.href != null || run.onClick != null) return null;
  return [
    resolveRunFont(run, fallbackFont),
    run.color ?? '',
    run.letterSpacing ?? '',
    run.decoration ?? '',
    run.background ?? '',
  ].join('');
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
  // In a streaming turn, keep per-line fragment nodes so each new line can
  // fade in independently; collapse only settled (persisted) rows.
  const inFadeScope = useInFadeScope();
  const { runs, lineHeight } = props;

  // Native single-view path (opt-in, NATIVE-TEXT.md). When enabled and the
  // <MugenTextBlock> view is installed, the whole block is ONE native view
  // built from the same walk — a markdown row drops from 10–30 fibers to 1–2.
  // Computed unconditionally (hooks order); null unless the flag is on and the
  // host resolves, so the default per-fragment path below is unaffected.
  const Block = getMugenTextBlock();
  const wantBlock = isMugenTextBlockEnabled() && Block !== null;
  const block = useMemo(() => {
    if (!wantBlock || width <= 0 || runs.length === 0) return null;
    return buildBlockSpec({
      segments: segmentItems(runs, props.font),
      width: Math.max(0, width),
      lineHeight,
      align: props.align,
      fallbackFont: props.font,
      color: props.color,
      hasBreak: runs.some((r) => r.break),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantBlock, runs, props.font, props.align, props.color, lineHeight, width, epoch]);

  const painted = useMemo(() => {
    if (wantBlock) return null; // block mode replaces the fragment paint
    if (width <= 0 || runs.length === 0) return null;
    const segments = segmentItems(runs, props.font);
    const hasText = segments.some((s) => s.items.length > 0);
    const hasBreak = runs.some((r) => r.break);
    if (!hasText && !hasBreak) return null;

    // Fragments grouped per painted line, so the render can collapse runs of
    // single-fragment same-style lines into one <Text> (see below).
    const lines: PaintedFragment[][] = [];
    let top = 0;
    for (let si = 0; si < segments.length; si++) {
      const seg = segments[si]!;
      if (seg.items.length === 0) {
        lines.push([]); // blank line (hard break) — measured as one line
        top += lineHeight;
        continue;
      }
      const prepared = prepareCached(seg.items);
      const ranges: RichInlineLineRange[] = [];
      walkRichInlineLineRanges(prepared, Math.max(0, width), (r) => ranges.push(r));
      if (ranges.length === 0) {
        lines.push([]);
        top += lineHeight; // mirror the measure's `max(1, lineCount)`
        continue;
      }
      for (let li = 0; li < ranges.length; li++) {
        const line = materializeRichInlineLineRange(prepared, ranges[li]!);
        let x = alignOffset(props.align, width, line.width);
        const lineFrags: PaintedFragment[] = [];
        for (let fi = 0; fi < line.fragments.length; fi++) {
          const frag = line.fragments[fi]!;
          x += frag.gapBefore;
          const run = seg.runs[frag.itemIndex];
          if (run == null) continue;
          lineFrags.push({
            key: `${si}:${li}:${fi}`,
            left: x,
            top,
            run,
            text: frag.text,
            width: frag.occupiedWidth,
          });
          x += frag.occupiedWidth;
        }
        lines.push(lineFrags);
        top += lineHeight;
      }
    }
    return { lines, height: top };
    // `epoch` invalidates when fonts (re)register and metrics change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantBlock, runs, props.font, props.align, lineHeight, width, epoch]);

  // Native single-view render: one <MugenTextBlock> paints the whole block from
  // pretext's own geometry; inline-box contents overlay as siblings at their
  // reserved advances. Selection spans the block for free.
  if (wantBlock && Block !== null) {
    if (block === null) return null;
    return (
      <View style={{ height: block.height }}>
        <Block spec={block.spec} style={{ width, height: block.height }} />
        {block.boxes.map((b) => (
          <View
            key={b.key}
            style={{
              position: 'absolute',
              left: b.left,
              top: b.top,
              width: b.advance,
              height: b.height,
              overflow: 'hidden',
              justifyContent: 'center',
            }}
          >
            {b.content}
          </View>
        ))}
      </View>
    );
  }

  if (painted === null) return null;

  const styleForRun = (run: RichTextRun): TextStyle => ({
    ...fontShorthandToTextStyle(resolveRunFont(run, props.font)),
    lineHeight: props.lineHeight,
    // Code runs render literal `===`/`!=` — turn ligatures off (see NO_LIGATURES).
    ...(run.noLigatures ? { fontVariant: NO_LIGATURES } : null),
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
  });

  const paintFragment = (f: PaintedFragment): ReactNode => {
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
          style={[{ position: 'absolute', left: f.left, top: f.top }, styleForRun(run)]}
        >
          {f.text}
        </RNText>
      </FadeLine>
    );
  };

  // Collapse maximal runs of consecutive lines that are each a SINGLE
  // collapsible fragment (plain text, same style, same left) into one
  // multi-line `<Text>` joined by '\n' — one Fabric node for a whole
  // paragraph instead of one per line, matching the web's mount cost. Lines
  // with inline marks (bold word, code span, link) keep their per-fragment
  // nodes. `numberOfLines` caps the merged node at its line count, so the
  // pretext-owned height can't grow (a sub-pixel shaper disagreement clips).
  const children: ReactNode[] = [];
  const lines = painted.lines;
  let i = 0;
  while (i < lines.length) {
    const frags = lines[i]!;
    const sig =
      !inFadeScope && frags.length === 1 ? collapseSignature(frags[0]!.run, props.font) : null;
    if (sig !== null) {
      const first = frags[0]!;
      const group: PaintedFragment[] = [first];
      let j = i + 1;
      while (j < lines.length) {
        const nf = lines[j]!;
        if (nf.length !== 1) break;
        const f2 = nf[0]!;
        if (f2.left !== first.left || collapseSignature(f2.run, props.font) !== sig) break;
        group.push(f2);
        j++;
      }
      children.push(
        <FadeLine key={`grp:${first.key}`}>
          <RNText
            numberOfLines={group.length}
            ellipsizeMode="clip"
            selectable={props.selectable}
            style={[
              { position: 'absolute', left: first.left, top: first.top, right: 0 },
              styleForRun(first.run),
            ]}
          >
            {group.map((g) => g.text).join('\n')}
          </RNText>
        </FadeLine>,
      );
      i = j;
      continue;
    }
    // Mixed / interactive line: paint each fragment as its own node.
    for (const f of frags) children.push(paintFragment(f));
    i++;
  }

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
