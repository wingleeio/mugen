import {
  createElement,
  type CSSProperties,
  type JSX,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  markPrimitive,
  assertMeasurableFont,
  fontEpoch,
  fontLonghands,
  type Font,
  type MeasureContext,
  type MeasurableStyle,
  type SafeClassName,
} from '@wingleeio/mugen/native-core';
import {
  prepareRichInline,
  measureRichInlineStats,
  type PreparedRichInline,
  type RichInlineItem,
} from '@chenglou/pretext/rich-inline';

/**
 * One styled span of inline text. A `RichText` is a sequence of runs that wrap
 * together as a single flowing paragraph — the thing markdown inline content
 * (bold, italic, code, links inside a sentence) needs and that a single-font
 * `<Text>` can't express. Each run carries its own measurable `font`, so the
 * mixed fonts on a line are measured exactly (via `@chenglou/pretext`'s
 * rich-inline layout) and the painted spans use the identical fonts.
 */
export interface RichTextRun {
  /** The run's text. Ignored when `break` or `advance` is set. */
  text?: string;
  /**
   * Render this run as an **inline box** — the inline analogue of mugen's
   * `Escape`: it reserves exactly `advance` px in the flow (via pretext's
   * `extraWidth`) and paints {@link content}, whatever it is, without measuring
   * its insides. The flow wraps it as one non-breaking atom. The caller owns the
   * contract: `content` must render exactly `advance` px wide and no taller than
   * the line (use the exported `measureInline` to size text-based boxes).
   */
  advance?: number;
  /** The painted content of an inline box (see {@link advance}). */
  content?: ReactNode;
  /** Measurable font for this run; falls back to the `<RichText font>` prop. */
  font?: Font;
  color?: string;
  /** Background (e.g. inline-code chip). Cosmetic — does not affect height. */
  background?: string;
  /** CSS `text-decoration` (e.g. `"underline"`, `"line-through"`). Cosmetic. */
  decoration?: string;
  /** Render as a link with this `href` (sets the tag to `<a>` unless `as` is given). */
  href?: string;
  title?: string;
  onClick?: (e: unknown) => void;
  /** The element tag for this run. Defaults to `a` when `href` is set, else `span`. */
  as?: keyof JSX.IntrinsicElements;
  /** Forbid line breaks inside this run. */
  noBreak?: boolean;
  letterSpacing?: number;
  className?: string;
  /** A hard line break (renders `<br>`, forces a new line in the measure). */
  break?: boolean;
}

export interface RichTextProps<C extends string = string> {
  /** The inline runs to flow together. */
  runs: RichTextRun[];
  /** Line height in px — the height of every wrapped line. Required. */
  lineHeight: number;
  /** Fallback font for runs that don't set their own. */
  font?: Font;
  color?: string;
  align?: CSSProperties['textAlign'];
  /** Inline styles, minus spacing/sizing (owned by the layout). */
  style?: MeasurableStyle;
  className?: SafeClassName<C>;
}

/** Resolve a run's font against the flow fallback (exported for native renderers). */
export function resolveRunFont(run: RichTextRun, fallback: Font | undefined): Font {
  const font = run.font ?? fallback;
  if (font == null) {
    throw new Error(
      'mugen-markdown: <RichText> run needs a font — set `font` on the run or on <RichText>.',
    );
  }
  assertMeasurableFont(font);
  return font;
}

// Measurement placeholder for an inline box. pretext drops an item that lays out
// no glyph segment — a zero-width *space* (U+200B) is skipped, taking its
// `extraWidth` with it. A zero-width *non-joiner* (U+200C) lays out a zero-advance
// segment, so the item is kept and its `extraWidth` honoured while it contributes
// no width of its own. It's never painted (the DOM renders the box's `content`).
const BOX_PLACEHOLDER = '‌';

/**
 * One hard-break-delimited segment of the flow: the pretext items plus the
 * source run behind each item (`runs[i]` produced `items[i]`), so a renderer
 * that paints materialized line fragments (React Native) can map a fragment's
 * `itemIndex` back to its run's color/decoration/link. The measure only reads
 * `items`.
 */
export interface RichTextSegment {
  items: RichInlineItem[];
  runs: RichTextRun[];
}

/** Split runs into hard-break-delimited segments of rich-inline items. */
export function segmentItems(runs: RichTextRun[], fallback: Font | undefined): RichTextSegment[] {
  const segments: RichTextSegment[] = [];
  let cur: RichTextSegment = { items: [], runs: [] };
  for (const run of runs) {
    if (run.break) {
      segments.push(cur);
      cur = { items: [], runs: [] };
      continue;
    }
    if (run.advance != null) {
      // Inline box: a zero-advance placeholder keeps the item alive and
      // `extraWidth` is the whole reserved advance, laid out as one non-breaking
      // atom. See BOX_PLACEHOLDER.
      cur.items.push({
        text: BOX_PLACEHOLDER,
        font: resolveRunFont(run, fallback),
        extraWidth: Math.max(0, run.advance),
        break: 'never',
      });
      cur.runs.push(run);
      continue;
    }
    const text = run.text ?? '';
    if (text.length === 0) continue;
    const item: RichInlineItem = { text, font: resolveRunFont(run, fallback) };
    if (run.letterSpacing != null) item.letterSpacing = run.letterSpacing;
    if (run.noBreak) item.break = 'never';
    cur.items.push(item);
    cur.runs.push(run);
  }
  segments.push(cur);
  return segments;
}

// Cache prepared rich-inline handles. Keyed on the segment's (font, spacing,
// break, text) tuple — the inputs to the expensive canvas pass — and flushed
// when web fonts settle (epoch bump), mirroring mugen's own text cache.
const MAX_CACHE = 4096;
const prepCache = new Map<string, PreparedRichInline>();
let cacheEpoch = -1;

function segmentKey(items: RichInlineItem[]): string {
  let key = '';
  for (const it of items) {
    key += `${it.font}${it.letterSpacing ?? ''}${it.break ?? ''}${it.text}`;
  }
  return key;
}

/**
 * Prepare a segment's items with the shared LRU-ish cache (flushed on font
 * epoch). Exported for the native renderer, which materializes lines from the
 * exact same prepared handles the measure counted them on.
 */
export function prepareCached(items: RichInlineItem[]): PreparedRichInline {
  const epoch = fontEpoch();
  if (epoch !== cacheEpoch) {
    prepCache.clear();
    cacheEpoch = epoch;
  }
  const key = segmentKey(items);
  let prepared = prepCache.get(key);
  if (prepared === undefined) {
    if (prepCache.size >= MAX_CACHE) prepCache.clear();
    prepared = prepareRichInline(items);
    prepCache.set(key, prepared);
  }
  return prepared;
}

function measureRichText(props: RichTextProps, ctx: MeasureContext): number {
  const { runs, lineHeight } = props;
  if (runs.length === 0) return 0;
  const segments = segmentItems(runs, props.font);
  const hasText = segments.some((s) => s.items.length > 0);
  const hasBreak = runs.some((r) => r.break);
  if (!hasText && !hasBreak) return 0;

  const width = Math.max(0, ctx.width);
  let lines = 0;
  for (const seg of segments) {
    if (seg.items.length === 0) {
      // A blank line — e.g. the line a trailing/standalone hard break opens.
      lines += 1;
      continue;
    }
    lines += Math.max(1, measureRichInlineStats(prepareCached(seg.items), width).lineCount);
  }
  return lines * lineHeight;
}

function renderRichText(props: RichTextProps): ReactElement {
  const lh = props.lineHeight;
  const containerStyle: CSSProperties = {
    // The container needs the flow's base font, not whatever it inherits: every
    // line box must fit the container's strut, and a strut built from a smaller
    // inherited font-size sits on a different baseline than the runs — the
    // union then exceeds `lineHeight` (a 32px heading inside a 16px page gains
    // ~6px per line) and the painted height drifts from lines × lineHeight.
    ...(props.font != null ? fontLonghands(props.font, lh) : { lineHeight: `${lh}px` }),
    whiteSpace: 'normal',
    // Match pretext, which breaks a word that can't fit rather than overflow.
    overflowWrap: 'anywhere',
    margin: 0,
    padding: 0,
    ...(props.color != null ? { color: props.color } : null),
    ...(props.align != null ? { textAlign: props.align } : null),
    ...(props.style as CSSProperties | undefined),
  };

  const children: ReactNode[] = props.runs.map((run, i) => {
    if (run.break) return createElement('br', { key: i });
    if (run.advance != null) {
      // Inline box. `line-height: 0` keeps the box from extending the line box —
      // the container strut (base font + lineHeight) owns the height, exactly as
      // the measure models — so the box's own height is paint-only. The caller
      // keeps it within the line; we only guarantee the reserved width.
      const boxStyle: CSSProperties = {
        display: 'inline-block',
        verticalAlign: 'middle',
        lineHeight: 0,
        whiteSpace: 'nowrap',
      };
      return createElement('span', { key: i, style: boxStyle }, run.content);
    }
    const tag = run.as ?? (run.href != null ? 'a' : 'span');
    // Runs get `line-height: 0`: a zero-leading inline box can never extend a
    // line box, so the container's strut — base font + `lineHeight`, exactly
    // what the measure models — solely defines every line's height. With the
    // paragraph's line-height on each run instead, a run in another font
    // (inline code) sits on the shared baseline with different ascent/descent,
    // and the union grows the line ~0.5px past `lineHeight`. The font is
    // expanded to longhands so it can't conflict with the shaping longhands
    // below (React's shorthand/longhand mixing warning).
    const style: CSSProperties = {
      ...fontLonghands(resolveRunFont(run, props.font), 0),
      // Pin text shaping to the canvas defaults pretext measures with — page
      // CSS targeting the run's tag (e.g. `code { font-feature-settings:
      // 'liga' 0 }`) would otherwise change glyph widths and shift wrapping.
      fontVariantLigatures: 'normal',
      fontFeatureSettings: 'normal',
      letterSpacing: run.letterSpacing != null ? `${run.letterSpacing}px` : 'normal',
      ...(run.color != null ? { color: run.color } : null),
      ...(run.background != null ? { background: run.background } : null),
      ...(run.decoration != null ? { textDecoration: run.decoration } : null),
      ...(run.noBreak ? { whiteSpace: 'nowrap' } : null),
    };
    const elementProps: Record<string, unknown> = { key: i, style };
    if (run.href != null) elementProps.href = run.href;
    if (run.title != null) elementProps.title = run.title;
    if (run.onClick != null) elementProps.onClick = run.onClick;
    if (run.className != null) elementProps.className = run.className;
    return createElement(tag, elementProps, run.text ?? '');
  });

  return createElement('div', { className: props.className as string | undefined, style: containerStyle }, children);
}

/**
 * A measurable rich inline-text primitive: a paragraph of mixed-font runs that
 * wrap as one flow. Its height is `lines × lineHeight`, where `lines` comes from
 * pretext's rich-inline layout at the row's width — the same layout the browser
 * performs over the rendered spans, so the analytic height matches the paint.
 */
export const RichText = markPrimitive(
  renderRichText as <C extends string = string>(props: RichTextProps<C>) => ReactElement,
  {
    name: 'RichText',
    measure: (props, ctx) => measureRichText(props as unknown as RichTextProps, ctx),
    // Max-content width: the widest hard-break segment laid out on one line —
    // what the flow takes as a flex item when nothing forces it to wrap. Lets
    // content-based HStack distribution (e.g. table cells) match the DOM.
    naturalWidth: (props) => {
      const p = props as unknown as RichTextProps;
      if (p.runs.length === 0) return 0;
      const segments = segmentItems(p.runs, p.font);
      let max = 0;
      for (const seg of segments) {
        if (seg.items.length === 0) continue;
        max = Math.max(max, measureRichInlineStats(prepareCached(seg.items), 1e7).maxLineWidth);
      }
      return max;
    },
  },
);

/**
 * Measure a string's rendered advance in px for a given measurable font — the
 * same ruler `RichText` measures with. Use it to size an inline box: a text
 * "pill" reserves `measureInline(label, font) + horizontalPadding`.
 */
export function measureInline(text: string, font: Font): number {
  if (text.length === 0) return 0;
  assertMeasurableFont(font);
  return measureRichInlineStats(prepareCached([{ text, font }]), 1e7).maxLineWidth;
}

/** Drop the rich-inline prepare cache (tests / memory pressure). */
export function clearRichTextCache(): void {
  prepCache.clear();
  cacheEpoch = -1;
}
