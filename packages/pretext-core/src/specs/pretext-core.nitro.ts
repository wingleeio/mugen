// Nitro spec for the pretext-core JSI surface. All calls are synchronous.
// Mirrors @chenglou/pretext's API shape (see PORTING.md); the JS wrapper in
// src/index.ts re-exposes the exact pretext function signatures on top.
import type { HybridObject } from 'react-native-nitro-modules';

export interface LayoutCursor {
  segmentIndex: number;
  graphemeIndex: number;
}

export interface LayoutResultSpec {
  lineCount: number;
  height: number;
}

export interface LineStatsSpec {
  lineCount: number;
  maxLineWidth: number;
}

export interface LayoutLineSpec {
  text: string;
  width: number;
  start: LayoutCursor;
  end: LayoutCursor;
}

export interface LayoutLinesResultSpec {
  lineCount: number;
  height: number;
  lines: LayoutLineSpec[];
}

export interface RichInlineItemSpec {
  text: string;
  font: string;
  letterSpacing: number;
  breakNever: boolean;
  extraWidth: number;
}

export interface RichInlineCursorSpec {
  itemIndex: number;
  segmentIndex: number;
  graphemeIndex: number;
}

export interface RichInlineFragmentSpec {
  itemIndex: number;
  // Materialized fragment text. Always present (materialization is cheap in
  // native); materializeRichInlineLineRange in the JS wrapper is a
  // passthrough.
  text: string;
  gapBefore: number;
  occupiedWidth: number;
  start: LayoutCursor;
  end: LayoutCursor;
}

export interface RichInlineLineSpec {
  fragments: RichInlineFragmentSpec[];
  width: number;
  end: RichInlineCursorSpec;
}

export interface RichWalkResultSpec {
  lineCount: number;
  lines: RichInlineLineSpec[];
}

export interface PreparedText
  extends HybridObject<{ ios: 'c++'; android: 'c++' }> {
  layout(maxWidth: number, lineHeight: number): LayoutResultSpec;
  layoutWithLines(maxWidth: number, lineHeight: number): LayoutLinesResultSpec;
  measureLineStats(maxWidth: number): LineStatsSpec;
  naturalWidth(): number;
}

export interface PreparedRichInline
  extends HybridObject<{ ios: 'c++'; android: 'c++' }> {
  walk(maxWidth: number): RichWalkResultSpec;
  stats(maxWidth: number): LineStatsSpec;
}

export interface PretextCore
  extends HybridObject<{ ios: 'c++'; android: 'c++' }> {
  // --- pretext-native registration surface ---
  registerFont(
    family: string,
    weight: number,
    style: string,
    data: ArrayBuffer,
  ): void;
  clearRegisteredFonts(): void;
  setGenericFontFamily(generic: string, family: string): void;
  setEmojiAdvanceEm(value: number): void;
  measureTextWidth(text: string, font: string): number;

  // --- pretext prepare/layout surface ---
  prepare(
    text: string,
    font: string,
    withSegments: boolean,
    whiteSpace: string,
    wordBreak: string,
    letterSpacing: number,
  ): PreparedText;

  prepareRichInline(items: RichInlineItemSpec[]): PreparedRichInline;

  clearCache(): void;
}
