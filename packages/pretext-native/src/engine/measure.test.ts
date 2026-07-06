import { beforeEach, describe, expect, it } from 'vitest';
import { buildTestFont } from '../testing.js';
import { measureTextWidth, setEmojiAdvanceEm } from './measure.js';
import { clearRegisteredFonts, getRegisteredFonts, registerFont, setGenericFontFamily } from './registry.js';
import { parseFontShorthand } from './shorthand.js';
import { MeasureContext2D, OffscreenCanvasShim } from './canvas-shim.js';

// Advances in font units at unitsPerEm 1000, so at 100px: divide by 10.
const testFontBytes = buildTestFont({
  unitsPerEm: 1000,
  notdefAdvance: 500,
  glyphs: [
    { char: ' ', advance: 250 },
    { char: 'A', advance: 600 },
    { char: 'B', advance: 550 },
    { char: 'V', advance: 650 },
  ],
  kernPairs: [{ left: 'A', right: 'V', value: -80 }],
});

beforeEach(() => {
  clearRegisteredFonts();
  setEmojiAdvanceEm(1.0);
  registerFont({ family: 'Test', data: testFontBytes });
});

describe('parseFontShorthand', () => {
  it('parses the full shorthand with style, weight, line-height, and quoted families', () => {
    expect(parseFontShorthand("italic 500 17px/24px Inter, 'Segoe UI', sans-serif")).toEqual({
      style: 'italic',
      weight: 500,
      sizePx: 17,
      families: ['Inter', 'Segoe UI', 'sans-serif'],
    });
  });

  it('parses minimal and keyword forms', () => {
    expect(parseFontShorthand('16px Inter')).toEqual({ style: 'normal', weight: 400, sizePx: 16, families: ['Inter'] });
    expect(parseFontShorthand('600 15px Inter').weight).toBe(600);
    expect(parseFontShorthand('bold 15px Inter').weight).toBe(700);
    expect(parseFontShorthand('oblique 15px Inter').style).toBe('oblique');
    expect(parseFontShorthand('15px/1.5 Inter').sizePx).toBe(15);
    expect(parseFontShorthand('12.5px "My Font"').families).toEqual(['My Font']);
  });

  it('throws a clear error on unparseable input', () => {
    expect(() => parseFontShorthand('Inter')).toThrow(/px font size/);
    expect(() => parseFontShorthand('wobbly 16px Inter')).toThrow(/unrecognized token "wobbly"/);
    expect(() => parseFontShorthand('16px ')).toThrow(/no font family/);
  });
});

describe('measureTextWidth', () => {
  it('sums advances and applies pair kerning', () => {
    // (600 + 650 - 80) font units at 100px / 1000 upem.
    expect(measureTextWidth('AV', '100px Test')).toBeCloseTo(117, 10);
    expect(measureTextWidth('AB', '100px Test')).toBeCloseTo(115, 10); // no kern pair
    expect(measureTextWidth('A A', '100px Test')).toBeCloseTo(145, 10);
    expect(measureTextWidth('', '100px Test')).toBe(0);
  });

  it('measures unmapped characters as .notdef of the primary face', () => {
    expect(measureTextWidth('Z', '100px Test')).toBeCloseTo(50, 10);
  });

  it('falls back across the family list per code point', () => {
    // OnlyB maps just 'B' with a distinctive advance; 'A' must fall through
    // to Test while 'B' resolves from OnlyB.
    registerFont({
      family: 'OnlyB',
      data: buildTestFont({ unitsPerEm: 1000, glyphs: [{ char: 'B', advance: 900 }] }),
    });
    expect(measureTextWidth('B', '100px OnlyB, Test')).toBeCloseTo(90, 10);
    expect(measureTextWidth('A', '100px OnlyB, Test')).toBeCloseTo(60, 10);
    // Unregistered first family is skipped entirely.
    expect(measureTextWidth('A', '100px Missing, Test')).toBeCloseTo(60, 10);
  });

  it('does not kern across a font-fallback boundary', () => {
    registerFont({
      family: 'OnlyA',
      data: buildTestFont({
        unitsPerEm: 1000,
        glyphs: [{ char: 'A', advance: 600 }],
        kernPairs: [{ left: 'A', right: 'A', value: -50 }],
      }),
    });
    // 'A' from OnlyA, 'V' from Test: two faces, no kerning even though Test
    // has an A,V pair.
    expect(measureTextWidth('AV', '100px OnlyA, Test')).toBeCloseTo(60 + 65, 10);
    // Same face on both sides: kerning applies.
    expect(measureTextWidth('AA', '100px OnlyA, Test')).toBeCloseTo(60 + 60 - 5, 10);
  });

  it('selects the nearest registered weight', () => {
    clearRegisteredFonts();
    registerFont({ family: 'Test', weight: 400, data: testFontBytes });
    registerFont({
      family: 'Test',
      weight: 700,
      data: buildTestFont({ unitsPerEm: 1000, glyphs: [{ char: 'A', advance: 800 }] }),
    });
    expect(measureTextWidth('A', '400 100px Test')).toBeCloseTo(60, 10); // exact
    expect(measureTextWidth('A', 'bold 100px Test')).toBeCloseTo(80, 10); // exact via keyword
    expect(measureTextWidth('A', '600 100px Test')).toBeCloseTo(80, 10); // 700 is nearer than 400
    expect(measureTextWidth('A', '500 100px Test')).toBeCloseTo(60, 10); // 400 is nearer than 700
  });

  it('resolves generic families through setGenericFontFamily', () => {
    expect(() => measureTextWidth('A', '16px sans-serif')).toThrow(/registerFont/);
    setGenericFontFamily('sans-serif', 'Test');
    expect(measureTextWidth('A', '100px sans-serif')).toBeCloseTo(60, 10);
  });

  it('resolves quoted family names and italic falls back to normal', () => {
    registerFont({ family: 'My Test', data: testFontBytes });
    expect(measureTextWidth('A', "100px 'My Test'")).toBeCloseTo(60, 10);
    // No italic face registered: synthetic italic measures like normal.
    expect(measureTextWidth('A', 'italic 100px Test')).toBeCloseTo(60, 10);
  });

  it('ignores line-height in the shorthand', () => {
    expect(measureTextWidth('A', '100px/240px Test')).toBeCloseTo(60, 10);
  });

  it('throws when nothing resolves, naming the families', () => {
    expect(() => measureTextWidth('A', '16px Nope, AlsoNope')).toThrow(/Nope, AlsoNope[\s\S]*registerFont/);
  });

  it('uses the emoji advance for unmapped emoji, zero for joiners/modifiers', () => {
    expect(measureTextWidth('\u{1F600}', '100px Test')).toBeCloseTo(100, 10); // 1em default
    // Thumbs up + skin tone: modifier contributes 0.
    expect(measureTextWidth('\u{1F44D}\u{1F3FD}', '100px Test')).toBeCloseTo(100, 10);
    // ZWJ family: three pictographs + two ZWJs = 3em.
    expect(measureTextWidth('\u{1F468}\u200D\u{1F469}\u200D\u{1F467}', '100px Test')).toBeCloseTo(300, 10);
    // VS16 is zero-width (heavy black heart + VS16).
    expect(measureTextWidth('\u2764\uFE0F', '100px Test')).toBeCloseTo(100, 10);
    setEmojiAdvanceEm(1.25);
    expect(measureTextWidth('\u{1F600}', '100px Test')).toBeCloseTo(125, 10);
  });

  it('applies GPOS kerning and ignores the kern table when GPOS kern exists', () => {
    clearRegisteredFonts();
    registerFont({
      family: 'Gpos',
      data: buildTestFont({
        unitsPerEm: 1000,
        glyphs: [
          { char: 'A', advance: 600 },
          { char: 'V', advance: 650 },
        ],
        kernPairs: [{ left: 'A', right: 'V', value: -80 }],
        gposPairs: [{ left: 'A', right: 'V', xAdvance: -100 }],
      }),
    });
    expect(measureTextWidth('AV', '100px Gpos')).toBeCloseTo(60 + 65 - 10, 10);
  });
});

describe('registry', () => {
  it('lists registered faces with parsed metadata', () => {
    registerFont({ family: 'Test', weight: 'bold', style: 'italic', data: testFontBytes });
    const fonts = getRegisteredFonts();
    expect(fonts).toContainEqual({ family: 'Test', weight: 400, style: 'normal', unitsPerEm: 1000 });
    expect(fonts).toContainEqual({ family: 'Test', weight: 700, style: 'italic', unitsPerEm: 1000 });
  });
});

describe('canvas shim', () => {
  it('exposes the surface pretext touches: getContext("2d"), font, measureText().width', () => {
    const canvas = new OffscreenCanvasShim(1, 1);
    const ctx = canvas.getContext('2d');
    expect(ctx).toBeInstanceOf(MeasureContext2D);
    ctx!.font = '100px Test';
    expect(ctx!.measureText('AV').width).toBeCloseTo(117, 10);
    expect(canvas.getContext('webgl')).toBeNull();
  });
});
