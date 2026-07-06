import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clearCache, layout, prepare } from '@chenglou/pretext';
import { buildTestFont } from './testing.js';
import { installPretextPolyfills, measureTextWidth, PretextSegmenter, registerFont } from './index.js';

// Same end-to-end flow as pretext-e2e.test.ts, but with the Intl.Segmenter
// FALLBACK force-installed — this is what a Hermes device actually runs.
//
// Isolated in its own test file on purpose: vitest gives each test file a
// fresh module registry, so pretext's module-level segmenter caches start
// empty here and pick up the forced global. We still call pretext's
// clearCache() around the swap for belt-and-braces, and restore the real
// Intl.Segmenter afterwards.

const realSegmenter = Intl.Segmenter;

beforeAll(() => {
  clearCache(); // drop any cached ICU segmenter instances inside pretext
  const result = installPretextPolyfills({ force: { segmenter: true } });
  expect(result.canvasInstalled).toBe(true);
  expect(result.segmenterInstalled).toBe(true);
  expect(Intl.Segmenter as unknown).toBe(PretextSegmenter);

  registerFont({
    family: 'Test',
    data: buildTestFont({
      unitsPerEm: 1000,
      glyphs: [
        { char: ' ', advance: 250 },
        { char: 'A', advance: 600 },
      ],
    }),
  });
});

afterAll(() => {
  (Intl as { Segmenter: unknown }).Segmenter = realSegmenter;
  clearCache(); // don't leak fallback-built caches into other consumers
});

describe('pretext with the forced segmenter fallback', () => {
  const font = '100px Test';

  it('prepare/layout still produce the expected wrap', () => {
    const wordWidth = measureTextWidth('AAAA', font);
    const spaceWidth = measureTextWidth(' ', font);
    const prepared = prepare('AAAA AAAA AAAA', font);
    const result = layout(prepared, wordWidth + spaceWidth / 2, 120);
    expect(result.lineCount).toBe(3);
    expect(result.height).toBe(360);
  });

  it('handles punctuation and emoji through the fallback word segmenter', () => {
    const prepared = prepare('AA, AA! \u{1F600} A', font);
    const result = layout(prepared, 10000, 120);
    expect(result.lineCount).toBe(1);
  });
});
