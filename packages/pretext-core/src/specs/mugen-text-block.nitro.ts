// Nitro HybridView spec for <MugenTextBlock> — the "one native view per block"
// piece of NATIVE-TEXT.md. A Fabric native component that takes an
// attributed-string spec (styled runs + pretext-walked line geometry +
// inline-box placeholders) and draws the WHOLE markdown block as ONE native
// view (iOS: Core Text / TextKit; Android: Canvas / StaticLayout), so painted
// geometry equals the geometry pretext-core measured.
//
// ---------------------------------------------------------------------------
// Spec shape: PRE-BROKEN LINES (not runs + maxWidth + native re-break).
// ---------------------------------------------------------------------------
// The prompt offered two shapes:
//   (a) pass runs + maxWidth and let the native view re-run pretext-core's
//       rich-inline walk to reproduce the break points, or
//   (b) pass the already-broken lines (an array of lines, each an array of
//       positioned fragments) and let the native view just paint them.
//
// Nitro 0.36.1 view props accept nested arrays-of-structs (verified: `npx
// nitrogen` generates the view bindings for this spec cleanly), so per the
// prompt's stated preference we take (b). Why (b) is the right call here:
//
//   • Byte-identical paint by construction. mugen's measure pass and the paint
//     both flow from the SAME pretext-core rich-inline walk
//     (`walkRichInlineLineRanges`). If the JS side runs that walk once and
//     hands the native view the exact fragments it produced, the painted block
//     is `lines × lineHeight` and every fragment sits at pretext's own x — with
//     zero chance of the native side disagreeing with the measure.
//   • A Nitro HybridView is Swift/Kotlin (see ViewPlatformSpec: ios 'swift',
//     android 'kotlin'). Having the platform view reach back into the C++
//     pretext kernel would require a Swift↔C++ / Kotlin↔JNI bridge that the
//     measure already renders unnecessary. Shape (b) keeps the platform views
//     pure UIKit/Canvas — they receive geometry and draw, nothing else.
//   • mugen-markdown-native ALREADY computes exactly these runs+fragments in
//     rich-text.tsx (segmentItems → prepareCached → walkRichInlineLineRanges →
//     materializeRichInlineLineRange). The consumer builds this spec straight
//     from that existing walk; emitting one <MugenTextBlock spec={…}> replaces
//     the per-fragment <Text> tree with no new text math (NATIVE-TEXT.md).
//
// `runs` remains the styling source of truth (deliverable #1's exact fields);
// `lines[].fragments[]` reference a run by index for style + inline-box-ness.
// `maxWidth` is still carried (alignment container width, and so the native
// side COULD validate/re-break as an escape hatch), and `lineHeight`/`align`
// pin the block's vertical rhythm and horizontal placement.
//
// NOTE: The native drawing code (ios/HybridMugenTextBlock.swift,
// android/.../HybridMugenTextBlock.kt) is NOT compiled on the host — it builds
// only inside the comet dev client (RN 0.81, Xcode 26) per NATIVE-TEXT.md. On
// the host we verify: `npx nitrogen` is clean, `pnpm check-types` passes, and
// `pnpm build` still succeeds.
import type { HybridView, HybridViewProps } from 'react-native-nitro-modules';

/** Horizontal alignment of each line within `maxWidth`. */
export type MugenTextAlign = 'left' | 'center' | 'right';

/**
 * One styled span in the block — the native analogue of mugen-markdown's
 * `RichTextRun`. A run is either a text run (has {@link text}) or an
 * **inline-box placeholder** (has {@link advance}): a box reserves exactly
 * `advance` px in the flow and paints nothing itself (the React side overlays
 * the box content as an absolutely-positioned sibling at the reserved x). The
 * fields mirror what rich-text.tsx already resolves per fragment.
 */
export interface MugenTextRun {
  /** The run's text. Absent (or ignored) when {@link advance} is set. */
  text?: string;
  /**
   * Present ⇒ this run is an inline-box placeholder reserving `advance` px of
   * flow width (mugen's `Escape`/inline-box; pretext reserves it via
   * `extraWidth`). The native view draws no glyphs for it.
   */
  advance?: number;
  /** Inline-box height (informational; the flow owns the line height). */
  height?: number;
  /** Canvas font shorthand (e.g. `"600 16px Inter"`), as pretext measured it. */
  font: string;
  /** Text colour, any CSS colour string the platform parser accepts. */
  color: string;
  /** Background fill (inline-code chip, mark). Cosmetic; height-neutral. */
  background?: string;
  /** CSS `text-decoration` (`"underline"`, `"line-through"`, or both). */
  decoration?: string;
  /** Per-run letter spacing in px (matches the value pretext measured with). */
  letterSpacing?: number;
  /** Turn every ligature class off (code runs draw literal `===`/`!=`/`=>`). */
  noLigatures?: boolean;
}

/**
 * One painted fragment on a line — the materialized output of pretext's
 * rich-inline walk (`RichInlineFragment`), pre-positioned in JS so the native
 * view just draws it. `x` is the fragment's left edge within the line, before
 * alignment (the native view adds the align offset per line); `width` is the
 * occupied advance. Fragments within a line are NOT contiguous — pretext's
 * collapsed inter-item whitespace lives in the gaps between successive `x`s —
 * so each fragment MUST be drawn at its own `x`, exactly as rich-text.tsx
 * paints each fragment as its own absolutely-positioned `<Text>`.
 */
export interface MugenTextFragment {
  /** Index into {@link MugenTextBlockSpec.runs} — style + inline-box-ness. */
  runIndex: number;
  /** Materialized fragment text (empty string for an inline-box placeholder). */
  text: string;
  /** Left edge of the fragment within the line, in px (pre-alignment). */
  x: number;
  /** Occupied advance width of the fragment, in px. */
  width: number;
}

/**
 * One laid-out line. `fragments` is empty for a blank line (a hard break's
 * empty line), which still occupies one `lineHeight`. `width` is the line's
 * total occupied width, used to compute the per-line alignment offset.
 */
export interface MugenTextLine {
  fragments: MugenTextFragment[];
  width: number;
}

/**
 * The whole attributed-string block. `runs` is the style table; `lines` is the
 * pretext-walked geometry referencing it. Painted height is
 * `lines.length * lineHeight` by construction.
 */
export interface MugenTextBlockSpec {
  /** Style table + inline-box placeholders, referenced by fragment `runIndex`. */
  runs: MugenTextRun[];
  /** pretext-walked lines of positioned fragments (see the header note). */
  lines: MugenTextLine[];
  /** Height of every line, in px — the block's fixed vertical rhythm. */
  lineHeight: number;
  /** The width the lines were broken at (alignment container width). */
  maxWidth: number;
  /** Horizontal alignment of each line within `maxWidth`. Defaults to `left`. */
  align?: MugenTextAlign;
}

/**
 * Props for the {@link MugenTextBlock} Hybrid View. A single `spec` prop
 * carries the entire attributed string — one prop diff per block, one native
 * view per block.
 */
export interface MugenTextBlockProps extends HybridViewProps {
  spec: MugenTextBlockSpec;
}

/**
 * The Nitro Hybrid View. Implemented natively in Swift (iOS) and Kotlin
 * (Android) — see `nitro.json` autolinking. The JS wrapper is
 * `src/MugenTextBlock.tsx` (getHostComponent).
 */
export type MugenTextBlock = HybridView<MugenTextBlockProps>;
