// @wingleeio/pretext-core — a single import surface that mirrors
// @chenglou/pretext (+ @chenglou/pretext/rich-inline) and @wingleeio/pretext-native's
// registration API, dispatching to the native JSI HybridObject when it's
// installed and to the pure-JS engine otherwise.
//
// Two backends, chosen once at load by whether getNative() resolves:
//
//   • NATIVE  — every prepare/layout/rich call runs through the PretextCore
//     HybridObject. Prepared handles are boxed so the free-function API
//     (`layout(prepared, w, lh)`) can dispatch to `prepared.native.layout(w, lh)`.
//
//   • JS FALLBACK — the functions delegate straight to @chenglou/pretext,
//     @chenglou/pretext/rich-inline, and @wingleeio/pretext-native, returning
//     their results unchanged. With no native module the behaviour is identical
//     to importing @chenglou/pretext directly.

import {
  prepare as jsPrepare,
  prepareWithSegments as jsPrepareWithSegments,
  layout as jsLayout,
  layoutWithLines as jsLayoutWithLines,
  measureLineStats as jsMeasureLineStats,
  measureNaturalWidth as jsMeasureNaturalWidth,
  materializeLineRange as jsMaterializeLineRange,
  walkLineRanges as jsWalkLineRanges,
  layoutNextLine as jsLayoutNextLine,
  layoutNextLineRange as jsLayoutNextLineRange,
  clearCache as jsClearCache,
} from '@chenglou/pretext';
import type {
  PreparedText,
  PreparedTextWithSegments,
  PrepareOptions,
  LayoutResult,
  LayoutLine,
  LayoutLineRange,
  LayoutLinesResult,
  LayoutCursor,
  LineStats,
} from '@chenglou/pretext';
import {
  prepareRichInline as jsPrepareRichInline,
  walkRichInlineLineRanges as jsWalkRichInlineLineRanges,
  materializeRichInlineLineRange as jsMaterializeRichInlineLineRange,
  measureRichInlineStats as jsMeasureRichInlineStats,
  layoutNextRichInlineLineRange as jsLayoutNextRichInlineLineRange,
} from '@chenglou/pretext/rich-inline';
import type {
  RichInlineItem,
  PreparedRichInline,
  RichInlineCursor,
  RichInlineLine,
  RichInlineLineRange,
  RichInlineStats,
} from '@chenglou/pretext/rich-inline';
import {
  installPretextPolyfills as jsInstallPretextPolyfills,
  registerFont as jsRegisterFont,
  clearRegisteredFonts as jsClearRegisteredFonts,
  getRegisteredFonts as jsGetRegisteredFonts,
  setGenericFontFamily as jsSetGenericFontFamily,
  resolveGenericFontFamily as jsResolveGenericFontFamily,
  setEmojiAdvanceEm as jsSetEmojiAdvanceEm,
  measureTextWidth as jsMeasureTextWidth,
} from '@wingleeio/pretext-native';
import type {
  RegisterFontOptions,
  ParsedFontInfo,
  InstallPretextPolyfillsOptions,
  InstallPretextPolyfillsResult,
} from '@wingleeio/pretext-native';

import { getNative } from './native.js';
import type {
  PreparedText as PreparedTextHybrid,
  PreparedRichInline as PreparedRichInlineHybrid,
  RichInlineItemSpec,
  LayoutLineSpec,
} from './specs/pretext-core.nitro.js';

// ---------------------------------------------------------------------------
// Re-exported types — consumers get the exact @chenglou/pretext + pretext-native
// shapes regardless of backend.
// ---------------------------------------------------------------------------

export type {
  PreparedText,
  PreparedTextWithSegments,
  PrepareOptions,
  LayoutResult,
  LayoutLine,
  LayoutLineRange,
  LayoutLinesResult,
  LayoutCursor,
  LineStats,
} from '@chenglou/pretext';
export type {
  RichInlineItem,
  PreparedRichInline,
  RichInlineCursor,
  RichInlineFragment,
  RichInlineFragmentRange,
  RichInlineLine,
  RichInlineLineRange,
  RichInlineStats,
} from '@chenglou/pretext/rich-inline';
export type {
  RegisterFontOptions,
  ParsedFontInfo,
  ParsedShorthand,
  FontStyle,
  InstallPretextPolyfillsOptions,
  InstallPretextPolyfillsResult,
} from '@wingleeio/pretext-native';

// parseFontShorthand is a pure string parser with no native counterpart —
// re-export it directly on both paths.
export { parseFontShorthand } from '@wingleeio/pretext-native';

// ---------------------------------------------------------------------------
// Prepared-handle boxing. On native, a prepared handle is a HybridObject we
// must keep alive and dispatch method calls on; we box it behind the opaque
// pretext handle type. On JS, prepare() returns the real pretext handle
// untouched (so results stay byte-identical), and unboxing is never reached.
// ---------------------------------------------------------------------------

interface TextBox {
  __ptcNativeText: PreparedTextHybrid;
}
interface RichBox {
  __ptcNativeRich: PreparedRichInlineHybrid;
}
// Native line-range carrier: pretext's LayoutLineRange has no `text`, but the
// native engine always materializes it, so we thread it through for
// materializeLineRange (a passthrough on native).
interface NativeTextRange extends LayoutLineRange {
  __text: string;
}

function boxText(h: PreparedTextHybrid): PreparedText {
  return { __ptcNativeText: h } as unknown as PreparedText;
}
function unboxText(p: PreparedText): PreparedTextHybrid {
  return (p as unknown as TextBox).__ptcNativeText;
}
function boxRich(h: PreparedRichInlineHybrid): PreparedRichInline {
  return { __ptcNativeRich: h } as unknown as PreparedRichInline;
}
function unboxRich(p: PreparedRichInline): PreparedRichInlineHybrid {
  return (p as unknown as RichBox).__ptcNativeRich;
}

function toLayoutLine(l: LayoutLineSpec): LayoutLine {
  return { text: l.text, width: l.width, start: l.start, end: l.end };
}

// ---------------------------------------------------------------------------
// pretext prepare / layout surface
// ---------------------------------------------------------------------------

export function prepare(text: string, font: string, options?: PrepareOptions): PreparedText {
  const n = getNative();
  if (n === null) return jsPrepare(text, font, options);
  return boxText(
    n.prepare(
      text,
      font,
      false,
      options?.whiteSpace ?? 'normal',
      options?.wordBreak ?? 'normal',
      options?.letterSpacing ?? 0,
    ),
  );
}

export function prepareWithSegments(
  text: string,
  font: string,
  options?: PrepareOptions,
): PreparedTextWithSegments {
  const n = getNative();
  if (n === null) return jsPrepareWithSegments(text, font, options);
  return boxText(
    n.prepare(
      text,
      font,
      true,
      options?.whiteSpace ?? 'normal',
      options?.wordBreak ?? 'normal',
      options?.letterSpacing ?? 0,
    ),
  ) as unknown as PreparedTextWithSegments;
}

export function layout(prepared: PreparedText, maxWidth: number, lineHeight: number): LayoutResult {
  const n = getNative();
  if (n === null) return jsLayout(prepared, maxWidth, lineHeight);
  const r = unboxText(prepared).layout(maxWidth, lineHeight);
  return { lineCount: r.lineCount, height: r.height };
}

export function layoutWithLines(
  prepared: PreparedTextWithSegments,
  maxWidth: number,
  lineHeight: number,
): LayoutLinesResult {
  const n = getNative();
  if (n === null) return jsLayoutWithLines(prepared, maxWidth, lineHeight);
  const r = unboxText(prepared).layoutWithLines(maxWidth, lineHeight);
  return { lineCount: r.lineCount, height: r.height, lines: r.lines.map(toLayoutLine) };
}

export function measureLineStats(prepared: PreparedTextWithSegments, maxWidth: number): LineStats {
  const n = getNative();
  if (n === null) return jsMeasureLineStats(prepared, maxWidth);
  const r = unboxText(prepared).measureLineStats(maxWidth);
  return { lineCount: r.lineCount, maxLineWidth: r.maxLineWidth };
}

export function measureNaturalWidth(prepared: PreparedTextWithSegments): number {
  const n = getNative();
  if (n === null) return jsMeasureNaturalWidth(prepared);
  return unboxText(prepared).naturalWidth();
}

export function materializeLineRange(
  prepared: PreparedTextWithSegments,
  line: LayoutLineRange,
): LayoutLine {
  const n = getNative();
  if (n === null) return jsMaterializeLineRange(prepared, line);
  // Native already materialized the text during walkLineRanges.
  return {
    text: (line as NativeTextRange).__text ?? '',
    width: line.width,
    start: line.start,
    end: line.end,
  };
}

export function walkLineRanges(
  prepared: PreparedTextWithSegments,
  maxWidth: number,
  onLine: (line: LayoutLineRange) => void,
): number {
  const n = getNative();
  if (n === null) return jsWalkLineRanges(prepared, maxWidth, onLine);
  // Native has no range-only walk; drive it off layoutWithLines and carry the
  // materialized text through for materializeLineRange.
  const r = unboxText(prepared).layoutWithLines(maxWidth, 0);
  for (const l of r.lines) {
    const range: NativeTextRange = {
      width: l.width,
      start: l.start,
      end: l.end,
      __text: l.text,
    };
    onLine(range);
  }
  return r.lineCount;
}

export function layoutNextLine(
  prepared: PreparedTextWithSegments,
  start: LayoutCursor,
  maxWidth: number,
): LayoutLine | null {
  const n = getNative();
  if (n === null) return jsLayoutNextLine(prepared, start, maxWidth);
  const r = unboxText(prepared).layoutWithLines(maxWidth, 0);
  for (const l of r.lines) {
    if (l.start.segmentIndex === start.segmentIndex && l.start.graphemeIndex === start.graphemeIndex) {
      return toLayoutLine(l);
    }
  }
  return null;
}

export function layoutNextLineRange(
  prepared: PreparedTextWithSegments,
  start: LayoutCursor,
  maxWidth: number,
): LayoutLineRange | null {
  const n = getNative();
  if (n === null) return jsLayoutNextLineRange(prepared, start, maxWidth);
  const line = layoutNextLine(prepared, start, maxWidth);
  if (line === null) return null;
  return { width: line.width, start: line.start, end: line.end };
}

export function clearCache(): void {
  const n = getNative();
  if (n === null) {
    jsClearCache();
    return;
  }
  n.clearCache();
}

// ---------------------------------------------------------------------------
// rich-inline surface
// ---------------------------------------------------------------------------

function toRichItemSpec(item: RichInlineItem): RichInlineItemSpec {
  return {
    text: item.text,
    font: item.font,
    letterSpacing: item.letterSpacing ?? 0,
    breakNever: item.break === 'never',
    extraWidth: item.extraWidth ?? 0,
  };
}

export function prepareRichInline(items: RichInlineItem[]): PreparedRichInline {
  const n = getNative();
  if (n === null) return jsPrepareRichInline(items);
  return boxRich(n.prepareRichInline(items.map(toRichItemSpec)));
}

export function walkRichInlineLineRanges(
  prepared: PreparedRichInline,
  maxWidth: number,
  onLine: (line: RichInlineLineRange) => void,
): number {
  const n = getNative();
  if (n === null) return jsWalkRichInlineLineRanges(prepared, maxWidth, onLine);
  // Native returns every line at once, already materialized. The spec's line
  // shape (fragments carry text) is a structural superset of RichInlineLineRange,
  // so we hand it straight to onLine; materializeRichInlineLineRange is then a
  // passthrough.
  const r = unboxRich(prepared).walk(maxWidth);
  for (const line of r.lines) {
    onLine(line as unknown as RichInlineLineRange);
  }
  return r.lineCount;
}

export function materializeRichInlineLineRange(
  prepared: PreparedRichInline,
  line: RichInlineLineRange,
): RichInlineLine {
  const n = getNative();
  if (n === null) return jsMaterializeRichInlineLineRange(prepared, line);
  // Native already materialized the fragment text in walk() — identity.
  return line as unknown as RichInlineLine;
}

export function measureRichInlineStats(
  prepared: PreparedRichInline,
  maxWidth: number,
): RichInlineStats {
  const n = getNative();
  if (n === null) return jsMeasureRichInlineStats(prepared, maxWidth);
  const r = unboxRich(prepared).stats(maxWidth);
  return { lineCount: r.lineCount, maxLineWidth: r.maxLineWidth };
}

export function layoutNextRichInlineLineRange(
  prepared: PreparedRichInline,
  maxWidth: number,
  start?: RichInlineCursor,
): RichInlineLineRange | null {
  const n = getNative();
  if (n === null) return jsLayoutNextRichInlineLineRange(prepared, maxWidth, start);
  // Native has no incremental rich walk; realize all lines and pick the one
  // starting at `start` (or the first line when no cursor is given).
  const r = unboxRich(prepared).walk(maxWidth);
  if (r.lines.length === 0) return null;
  if (start === undefined) return r.lines[0] as unknown as RichInlineLineRange;
  for (let i = 0; i < r.lines.length; i++) {
    const prev = i === 0 ? undefined : r.lines[i - 1]!.end;
    if (
      prev !== undefined &&
      prev.itemIndex === start.itemIndex &&
      prev.segmentIndex === start.segmentIndex &&
      prev.graphemeIndex === start.graphemeIndex
    ) {
      return r.lines[i] as unknown as RichInlineLineRange;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Registration surface (mirrors @wingleeio/pretext-native)
// ---------------------------------------------------------------------------

function normalizeWeight(weight: RegisterFontOptions['weight']): number {
  if (weight === undefined || weight === 'normal') return 400;
  if (weight === 'bold') return 700;
  return weight;
}

function toArrayBuffer(data: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (data instanceof Uint8Array) {
    return data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength,
    ) as ArrayBuffer;
  }
  return data;
}

export function registerFont(options: RegisterFontOptions): void {
  const n = getNative();
  if (n === null) {
    jsRegisterFont(options);
    return;
  }
  n.registerFont(
    options.family,
    normalizeWeight(options.weight),
    options.style ?? 'normal',
    toArrayBuffer(options.data),
  );
}

export function clearRegisteredFonts(): void {
  const n = getNative();
  if (n === null) {
    jsClearRegisteredFonts();
    return;
  }
  n.clearRegisteredFonts();
}

export function getRegisteredFonts(): ParsedFontInfo[] {
  const n = getNative();
  if (n === null) return jsGetRegisteredFonts();
  // The HybridObject exposes no enumeration surface; registration is
  // fire-and-forget on native.
  return [];
}

export function setGenericFontFamily(
  generic: Parameters<typeof jsSetGenericFontFamily>[0],
  family: string,
): void {
  const n = getNative();
  if (n === null) {
    jsSetGenericFontFamily(generic, family);
    return;
  }
  n.setGenericFontFamily(generic, family);
}

export function resolveGenericFontFamily(name: string): string | null {
  const n = getNative();
  if (n === null) return jsResolveGenericFontFamily(name);
  // No resolve surface on native; the JSI engine resolves generics internally.
  return null;
}

export function setEmojiAdvanceEm(value: number): void {
  const n = getNative();
  if (n === null) {
    jsSetEmojiAdvanceEm(value);
    return;
  }
  n.setEmojiAdvanceEm(value);
}

export function measureTextWidth(text: string, font: string): number {
  const n = getNative();
  if (n === null) return jsMeasureTextWidth(text, font);
  return n.measureTextWidth(text, font);
}

/**
 * Install the pretext measurement polyfills. On native this is a no-op — the
 * JSI engine already provides canvas + segmentation — so it reports nothing
 * installed. On JS it delegates to @wingleeio/pretext-native.
 */
export function installPretextPolyfills(
  options?: InstallPretextPolyfillsOptions,
): InstallPretextPolyfillsResult {
  if (getNative() === null) return jsInstallPretextPolyfills(options);
  return { canvasInstalled: false, segmenterInstalled: false };
}

// On the JS fallback path, prime the polyfills once at load so the very first
// measurement (which caches pretext's canvas ctx + segmenter) sees them. A
// no-op on native.
if (getNative() === null) {
  jsInstallPretextPolyfills();
}
