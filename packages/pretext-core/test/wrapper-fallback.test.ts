// With no native module present (the vitest host), @wingleeio/pretext-core must
// behave EXACTLY like importing @chenglou/pretext directly on top of the same
// pretext-native registry. This pins that: the wrapper's layout height for a
// prepared string is deep-equal to raw pretext's for the identical registration.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';

import {
  prepare,
  prepareWithSegments,
  layout,
  layoutWithLines,
  measureNaturalWidth,
  registerFont,
  setGenericFontFamily,
  installPretextPolyfills,
} from '../src/index.js';

import {
  prepare as rawPrepare,
  prepareWithSegments as rawPrepareWithSegments,
  layout as rawLayout,
  layoutWithLines as rawLayoutWithLines,
  measureNaturalWidth as rawMeasureNaturalWidth,
} from '@chenglou/pretext';

const here = dirname(fileURLToPath(import.meta.url));
const geist = join(here, 'fonts', 'Geist_400Regular.ttf');

const FONT = '400 16px Geist';
const TEXT = 'hello world foo bar baz';

describe('pretext-core JS fallback == @chenglou/pretext', () => {
  it('layout height matches raw pretext for the same registered fonts', () => {
    // Register through the wrapper (JS path forwards to pretext-native, which is
    // a module-level singleton shared with the raw @chenglou/pretext engine).
    installPretextPolyfills({ force: { canvas: true, segmenter: true } });
    registerFont({ family: 'Geist', weight: 400, style: 'normal', data: readFileSync(geist) });
    setGenericFontFamily('sans-serif', 'Geist');

    const prepared = prepare(TEXT, FONT);
    const result = layout(prepared, 100, 24);

    const rawPrepared = rawPrepare(TEXT, FONT);
    const rawResult = rawLayout(rawPrepared, 100, 24);

    expect(result).toEqual(rawResult);
    expect(result.height).toBe(rawResult.height);

    // Same for the segment-carrying path used by mugen's paint layouts.
    const segPrepared = prepareWithSegments(TEXT, FONT);
    const rawSegPrepared = rawPrepareWithSegments(TEXT, FONT);

    expect(layoutWithLines(segPrepared, 100, 24)).toEqual(
      rawLayoutWithLines(rawSegPrepared, 100, 24),
    );
    expect(measureNaturalWidth(segPrepared)).toBe(rawMeasureNaturalWidth(rawSegPrepared));
  });
});
