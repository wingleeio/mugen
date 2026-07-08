'use no memo';

// Opt-in bridge from mugen-markdown-native's RichText to the pretext-core
// <MugenTextBlock> single native view (NATIVE-TEXT.md). Default OFF: existing
// consumers keep the per-fragment <Text> paint until on-device verification
// flips the switch. When enabled AND the native view is installed, a whole
// block renders as ONE native view built from the SAME rich-inline walk the
// measure pass uses — so painted geometry equals the measured geometry.
//
// The spec is PRE-BROKEN LINES: this module runs pretext's walk in JS and hands
// the native view positioned fragments (see mugen-text-block.nitro.ts). Inline
// boxes (advance + content) reserve their advance in the spec and their content
// is overlaid by React as a sibling at the reserved x/top.

import type { ReactNode } from 'react';
import {
  walkRichInlineLineRanges,
  materializeRichInlineLineRange,
  type RichInlineLineRange,
} from '@chenglou/pretext/rich-inline';
import type { Font } from '@wingleeio/mugen/native-core';
import {
  prepareCached,
  resolveRunFont,
  type RichTextRun,
} from '@wingleeio/mugen-markdown/native-core';

// The pretext-core spec/component types. Imported as types only; the runtime
// component is resolved lazily below so bundlers that don't ship pretext-core
// (web, tests) never fail to resolve it.
import type {
  MugenTextBlockSpec,
  MugenTextRun,
  MugenTextLine,
  MugenTextAlign,
} from '@wingleeio/pretext-core/text-block';

export type { MugenTextBlockSpec };

/** A segment as produced by `segmentItems` (hard-break-delimited). */
export interface RichTextSegment {
  items: Array<{ text: string; font: string; letterSpacing?: number; break?: 'normal' | 'never'; extraWidth?: number }>;
  runs: RichTextRun[];
}

/** An inline-box overlay: the box reserves `advance` in the block flow; React
 *  paints its `content` on top at the box's laid-out position. */
export interface BoxOverlay {
  key: string;
  left: number;
  top: number;
  advance: number;
  height: number;
  content: ReactNode;
}

export interface BlockBuild {
  spec: MugenTextBlockSpec;
  boxes: BoxOverlay[];
  height: number;
}

// ── Enable flag (default off) ────────────────────────────────────────────────

let enabled = false;

/**
 * Turn the native single-view text block on/off (default off). comet flips this
 * on once the on-device measurements in NATIVE-TEXT.md hold (cold-open render,
 * zero blank scroll frames) — until then the proven per-fragment paint stays.
 */
export function setMugenTextBlockEnabled(value: boolean): void {
  enabled = value;
}

export function isMugenTextBlockEnabled(): boolean {
  return enabled;
}

// ── Lazy native component resolution ─────────────────────────────────────────

type BlockComponent = (props: { spec: MugenTextBlockSpec; style?: unknown }) => ReactNode;

let resolved: BlockComponent | null | undefined;

/** The `<MugenTextBlock>` component, or null when pretext-core/text-block isn't
 *  installed or resolves to a no-op (web/tests). Resolved once. */
export function getMugenTextBlock(): BlockComponent | null {
  if (resolved !== undefined) return resolved;
  resolved = null;
  try {
    if (typeof require === 'function') {
      const mod = require('@wingleeio/pretext-core/text-block') as {
        MugenTextBlock?: BlockComponent;
      };
      if (typeof mod?.MugenTextBlock === 'function') resolved = mod.MugenTextBlock;
    }
  } catch {
    resolved = null;
  }
  return resolved;
}

// ── Spec construction ────────────────────────────────────────────────────────

function alignFor(align: string | undefined): MugenTextAlign {
  if (align === 'center') return 'center';
  if (align === 'right' || align === 'end') return 'right';
  return 'left';
}

function alignOffset(align: MugenTextAlign, width: number, lineWidth: number): number {
  if (align === 'center') return Math.max(0, (width - lineWidth) / 2);
  if (align === 'right') return Math.max(0, width - lineWidth);
  return 0;
}

/** A run's fixed style, converted to the native spec's `MugenTextRun`. Text is
 *  per-fragment, so it is NOT part of the run here. */
function specRun(run: RichTextRun, fallbackFont: Font | undefined, color: string | undefined): MugenTextRun {
  const out: MugenTextRun = {
    font: resolveRunFont(run, fallbackFont),
    // Native colours are pre-resolved to concrete values by the theme layer
    // before reaching here; bottom out defensively so `color` is always a
    // string the platform parser accepts.
    color: run.color ?? color ?? '#000000',
  };
  if (run.advance != null) {
    out.advance = run.advance;
    // The inline box's height is owned by the flow (one lineHeight); the spec
    // field is informational, so leave it unset.
  }
  if (run.background != null) out.background = run.background;
  if (run.decoration != null) out.decoration = run.decoration;
  if (run.letterSpacing != null) out.letterSpacing = run.letterSpacing;
  if (run.noLigatures) out.noLigatures = true;
  return out;
}

/**
 * Build the `MugenTextBlockSpec` (+ inline-box overlays) for a block from the
 * same segments/walk the per-fragment paint uses. Returns null when there's
 * nothing to paint (matches `RichTextComponent`'s null-render). Fragment `x` is
 * PRE-alignment — the native view adds the per-line align offset — but box
 * overlays carry their final left (align included) because React positions them.
 */
export function buildBlockSpec(params: {
  segments: RichTextSegment[];
  width: number;
  lineHeight: number;
  align: string | undefined;
  fallbackFont: Font | undefined;
  color: string | undefined;
  hasBreak: boolean;
}): BlockBuild | null {
  const { segments, width, lineHeight, fallbackFont, color, hasBreak } = params;
  const hasText = segments.some((s) => s.items.length > 0);
  if (!hasText && !hasBreak) return null;

  const align = alignFor(params.align);
  const runs: MugenTextRun[] = [];
  const runIndex = new Map<RichTextRun, number>();
  const indexOf = (run: RichTextRun): number => {
    let idx = runIndex.get(run);
    if (idx === undefined) {
      idx = runs.length;
      runs.push(specRun(run, fallbackFont, color));
      runIndex.set(run, idx);
    }
    return idx;
  };

  const lines: MugenTextLine[] = [];
  const boxes: BoxOverlay[] = [];
  let top = 0;

  const pushBlankLine = (): void => {
    lines.push({ fragments: [], width: 0 });
    top += lineHeight;
  };

  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si]!;
    if (seg.items.length === 0) {
      pushBlankLine(); // blank line (hard break) — one line of height
      continue;
    }
    const prepared = prepareCached(seg.items);
    const ranges: RichInlineLineRange[] = [];
    walkRichInlineLineRanges(prepared, Math.max(0, width), (r) => ranges.push(r));
    if (ranges.length === 0) {
      pushBlankLine(); // mirror the measure's max(1, lineCount)
      continue;
    }
    for (let li = 0; li < ranges.length; li++) {
      const line = materializeRichInlineLineRange(prepared, ranges[li]!);
      const dx = alignOffset(align, width, line.width);
      let x = 0; // pre-alignment; native view adds dx
      const fragments = [];
      for (let fi = 0; fi < line.fragments.length; fi++) {
        const frag = line.fragments[fi]!;
        x += frag.gapBefore;
        const run = seg.runs[frag.itemIndex];
        if (run == null) continue;
        fragments.push({
          runIndex: indexOf(run),
          text: frag.text,
          x,
          width: frag.occupiedWidth,
        });
        // Inline box: reserve advance in the spec (drawn as nothing) and overlay
        // its content as a React sibling at the box's final position.
        if (run.advance != null && run.content != null) {
          boxes.push({
            key: `${si}:${li}:${fi}`,
            left: dx + x,
            top,
            advance: run.advance,
            height: lineHeight,
            content: run.content,
          });
        }
        x += frag.occupiedWidth;
      }
      lines.push({ fragments, width: line.width });
      top += lineHeight;
    }
  }

  const spec: MugenTextBlockSpec = { runs, lines, lineHeight, maxWidth: width, align };
  return { spec, boxes, height: top };
}
