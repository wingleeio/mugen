// The measurement core: canvas-measureText semantics reconstructed from font
// tables. pretext feeds strings through ctx.measureText(str).width; we answer
// with summed advance widths + pair kerning, scaled from font units to px.

import { parseFontShorthand, type ParsedShorthand } from './shorthand.js';
import { onRegistryChange, resolveFace, type Face } from './registry.js';

// --- emoji fallback -----------------------------------------------------------

// Font files rarely cover emoji (apps ship text fonts; the platform supplies
// the color emoji font, which we can't read from JS). Rather than measuring
// emoji as .notdef, assume the platform emoji font's near-universal metric:
// one em square per emoji. Configurable because Android's NotoColorEmoji and
// iOS's Apple Color Emoji differ slightly at some sizes.
let emojiAdvanceEm = 1.0;

export function setEmojiAdvanceEm(value: number): void {
  emojiAdvanceEm = value;
  resolvedCache.clear(); // cached advances baked in the old value
}

function isEmojiish(cp: number): boolean {
  // Coarse Extended-Pictographic check — only consulted for code points the
  // registered fonts do NOT map, so over-matching is harmless.
  return (cp >= 0x1f000 && cp <= 0x1faff) || (cp >= 0x2600 && cp <= 0x27bf);
}

function isZeroWidthEmojiJoiner(cp: number): boolean {
  // VS16, ZWJ, and skin-tone modifiers render as modifications of the
  // preceding emoji, never as their own advance. Treating them as
  // unconditionally zero-width matches how composed emoji sequences measure
  // (one em total), and is also correct when a text font happens to map them
  // (they'd be zero-advance glyphs there too).
  return cp === 0xfe0f || cp === 0x200d || (cp >= 0x1f3fb && cp <= 0x1f3ff);
}

// --- per-shorthand resolution cache --------------------------------------------

type CpEntry = {
  face: Face | null; // null => emoji fallback (no glyph, no kerning)
  glyph: number;
  advancePx: number;
};

type ResolvedFont = {
  faces: Face[];
  sizePx: number;
  // code point -> resolved face/glyph/advance. Font size is fixed per
  // shorthand, so advances can be cached in px directly.
  cpCache: Map<number, CpEntry>;
};

const resolvedCache = new Map<string, ResolvedFont>();
// Any registration/generic-mapping change can alter which face a family
// resolves to, so drop everything.
onRegistryChange(() => resolvedCache.clear());

function resolveShorthand(font: string): ResolvedFont {
  const cached = resolvedCache.get(font);
  if (cached !== undefined) return cached;

  const parsed: ParsedShorthand = parseFontShorthand(font);
  const faces: Face[] = [];
  for (const family of parsed.families) {
    const face = resolveFace(family, parsed.style, parsed.weight);
    // Skip unregistered families rather than failing: CSS-style fallback
    // means later families in the list still get their shot.
    if (face !== null && !faces.includes(face)) faces.push(face);
  }
  if (faces.length === 0) {
    throw new Error(
      `pretext-native: no registered font matches "${font}" ` +
        `(families tried: ${parsed.families.join(', ')}). ` +
        'Call registerFont({ family, data }) with the font binary before measuring, ' +
        'and setGenericFontFamily() if the shorthand only names a generic family.',
    );
  }

  const resolved: ResolvedFont = { faces, sizePx: parsed.sizePx, cpCache: new Map() };
  resolvedCache.set(font, resolved);
  return resolved;
}

function resolveCodePoint(rf: ResolvedFont, cp: number): CpEntry {
  const cached = rf.cpCache.get(cp);
  if (cached !== undefined) return cached;

  let entry: CpEntry | null = null;
  // CSS font fallback: first family in the list whose cmap covers the code
  // point wins. Glyph 0 means "unmapped" in every cmap format we parse.
  for (const face of rf.faces) {
    const glyph = face.font.glyphForCodePoint(cp);
    if (glyph !== 0) {
      entry = { face, glyph, advancePx: (face.font.advanceForGlyph(glyph) * rf.sizePx) / face.font.unitsPerEm };
      break;
    }
  }
  if (entry === null) {
    if (isEmojiish(cp)) {
      entry = { face: null, glyph: 0, advancePx: emojiAdvanceEm * rf.sizePx };
    } else {
      // Unmapped non-emoji (includes tab when the font doesn't map it):
      // browsers render .notdef, so measure .notdef of the primary face.
      const primary = rf.faces[0]!;
      entry = {
        face: primary,
        glyph: 0,
        advancePx: (primary.font.advanceForGlyph(0) * rf.sizePx) / primary.font.unitsPerEm,
      };
    }
  }
  rf.cpCache.set(cp, entry);
  return entry;
}

/**
 * Measure a string's advance width in px for a canvas font shorthand.
 * Semantics: per-code-point advances from the first covering registered face,
 * plus pair kerning between consecutive glyphs from the SAME face (kerning
 * across a font-fallback boundary doesn't exist in real engines either).
 */
export function measureTextWidth(text: string, font: string): number {
  const rf = resolveShorthand(font);
  let width = 0;
  let prevFace: Face | null = null;
  let prevGlyph = 0;

  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i)!;
    i += cp > 0xffff ? 2 : 1;

    if (isZeroWidthEmojiJoiner(cp)) {
      // Zero width, and transparent to the kerning chain (nothing kerns
      // around emoji anyway, but don't let a VS16 split a hypothetical pair).
      continue;
    }

    const entry = resolveCodePoint(rf, cp);
    if (entry.face !== null && entry.face === prevFace && prevGlyph !== 0 && entry.glyph !== 0) {
      width += (entry.face.font.kerningForPair(prevGlyph, entry.glyph) * rf.sizePx) / entry.face.font.unitsPerEm;
    }
    width += entry.advancePx;
    prevFace = entry.face;
    prevGlyph = entry.glyph;
  }
  return width;
}
