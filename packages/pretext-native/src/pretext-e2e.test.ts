import { beforeAll, describe, expect, it } from 'vitest';
import { layout, measureNaturalWidth, prepare, prepareWithSegments } from '@chenglou/pretext';
import { buildTestFont } from './testing.js';
import { installPretextPolyfills, measureTextWidth, registerFont } from './index.js';

// End-to-end: real @chenglou/pretext running on top of our canvas shim.
// Node 24 has no OffscreenCanvas, so installPretextPolyfills() genuinely
// installs the shim (Intl.Segmenter exists natively and is left alone —
// the forced-segmenter path lives in its own test file because pretext caches
// segmenter instances at module level).
//
// pretext's getMeasureContext() caches the context lazily on first
// measurement, which is why the install runs in beforeAll, before any
// prepare() call.

beforeAll(() => {
  const result = installPretextPolyfills();
  expect(result.canvasInstalled).toBe(true);
  expect(result.segmenterInstalled).toBe(false); // Node's ICU segmenter kept

  registerFont({
    family: 'Test',
    data: buildTestFont({
      unitsPerEm: 1000,
      glyphs: [
        { char: ' ', advance: 250 },
        { char: 'A', advance: 600 },
        { char: 'B', advance: 550 },
        { char: 'V', advance: 650 },
      ],
      kernPairs: [{ left: 'A', right: 'V', value: -80 }],
    }),
  });
});

describe('pretext on the canvas shim', () => {
  const font = '100px Test';
  const text = 'AAAA AAAA AAAA';

  it('wraps one word per line at a width that fits exactly one word', () => {
    // Derive expectations from our own measurement instead of hardcoding px:
    // 'AAAA' = 4 * 600 units at 100px/1000upem = 240px, space = 25px.
    const wordWidth = measureTextWidth('AAAA', font);
    const spaceWidth = measureTextWidth(' ', font);
    expect(wordWidth).toBeCloseTo(240, 10);
    expect(spaceWidth).toBeCloseTo(25, 10);

    // Fits one word (+ half a space of slack) but never two.
    const maxWidth = wordWidth + spaceWidth / 2;
    const lineHeight = 120;
    const prepared = prepare(text, font);
    const result = layout(prepared, maxWidth, lineHeight);
    expect(result.lineCount).toBe(3);
    expect(result.height).toBe(3 * lineHeight);
  });

  it('fits everything on one line when width allows', () => {
    const total = measureTextWidth(text, font); // 3 words + 2 spaces = 770px
    const prepared = prepare(text, font);
    const result = layout(prepared, total + 1, 120);
    expect(result.lineCount).toBe(1);
  });

  it('measureNaturalWidth agrees with measureTextWidth', () => {
    const prepared = prepareWithSegments(text, font);
    expect(measureNaturalWidth(prepared)).toBeCloseTo(measureTextWidth(text, font), 6);
  });

  it('handles kerned words identically to direct measurement', () => {
    const prepared = prepareWithSegments('AV AV', font);
    expect(measureNaturalWidth(prepared)).toBeCloseTo(measureTextWidth('AV AV', font), 6);
  });

  it('survives emoji in the text (emoji fallback advance, no DOM correction)', () => {
    // pretext's emoji correction path is DOM-guarded and no-ops in Node; the
    // shim measures unmapped emoji at 1em.
    const prepared = prepare('AAAA \u{1F600} AAAA', font);
    const result = layout(prepared, 10000, 120);
    expect(result.lineCount).toBe(1);
  });
});
