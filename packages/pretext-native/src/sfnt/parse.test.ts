import { describe, expect, it } from 'vitest';
import { buildTestCollection, buildTestFont } from '../testing.js';
import { parseFont } from './parse.js';

// Glyph ids follow spec order: .notdef=0, ' '=1, 'A'=2, 'B'=3, 'V'=4.
const spec = {
  unitsPerEm: 1000,
  notdefAdvance: 500,
  ascender: 800,
  descender: -200,
  lineGap: 50,
  glyphs: [
    { char: ' ', advance: 250 },
    { char: 'A', advance: 600 },
    { char: 'B', advance: 550 },
    { char: 'V', advance: 650 },
  ],
  kernPairs: [{ left: 'A', right: 'V', value: -80 }],
};

describe('sfnt parsing', () => {
  it('extracts head/hhea/maxp metadata', () => {
    const font = parseFont(buildTestFont(spec));
    expect(font.unitsPerEm).toBe(1000);
    expect(font.numGlyphs).toBe(5);
    expect(font.ascender).toBe(800);
    expect(font.descender).toBe(-200);
    expect(font.lineGap).toBe(50);
  });

  it('maps code points through cmap format 4 and reads hmtx advances', () => {
    const font = parseFont(buildTestFont(spec));
    const gA = font.glyphForCodePoint(0x41);
    const gV = font.glyphForCodePoint(0x56);
    expect(gA).toBe(2);
    expect(gV).toBe(4);
    expect(font.advanceForGlyph(gA)).toBe(600);
    expect(font.advanceForGlyph(font.glyphForCodePoint(0x42))).toBe(550);
    expect(font.advanceForGlyph(gV)).toBe(650);
    expect(font.advanceForGlyph(font.glyphForCodePoint(0x20))).toBe(250);
    expect(font.advanceForGlyph(0)).toBe(500); // .notdef
  });

  it('returns glyph 0 for unmapped code points', () => {
    const font = parseFont(buildTestFont(spec));
    expect(font.glyphForCodePoint(0x5a)).toBe(0); // 'Z'
    expect(font.glyphForCodePoint(0x1f600)).toBe(0); // BMP-only cmap
  });

  it('parses kern format-0 pairs', () => {
    const font = parseFont(buildTestFont(spec));
    expect(font.kerningForPair(2, 4)).toBe(-80); // A,V
    expect(font.kerningForPair(4, 2)).toBe(0); // V,A: unlisted direction
    expect(font.kerningForPair(2, 3)).toBe(0); // A,B: no pair
  });

  it('parses GPOS pair kerning and prefers it over the kern table', () => {
    const font = parseFont(
      buildTestFont({
        ...spec,
        // Both sources present with different values: shaping engines pick
        // GPOS when a 'kern' feature exists, so -100 must win over -80.
        gposPairs: [{ left: 'A', right: 'V', xAdvance: -100 }],
      }),
    );
    expect(font.kerningForPair(2, 4)).toBe(-100);
    expect(font.kerningForPair(2, 3)).toBe(0);
  });

  it('accepts a Uint8Array view into a larger buffer', () => {
    const bytes = buildTestFont(spec);
    // Simulate a font embedded mid-buffer (asset bundle style).
    const padded = new Uint8Array(bytes.length + 32);
    padded.set(bytes, 16);
    const view = new Uint8Array(padded.buffer, 16, bytes.length);
    expect(parseFont(view).unitsPerEm).toBe(1000);
  });

  it('unwraps TrueType collections by taking the first font', () => {
    const font = parseFont(buildTestCollection(spec));
    expect(font.unitsPerEm).toBe(1000);
    expect(font.advanceForGlyph(font.glyphForCodePoint(0x41))).toBe(600);
    expect(font.kerningForPair(2, 4)).toBe(-80);
  });

  it('throws on garbage input', () => {
    expect(() => parseFont(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))).toThrow(/sfnt/);
  });
});
