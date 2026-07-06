import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { layout, prepare } from '@chenglou/pretext';
import { buildTestFont } from './testing.js';
import { installPretextPolyfills, registerFont } from './index.js';

// React Native defines `navigator` — Hermes ships `{ product: 'ReactNative' }`
// — but no `userAgent`. pretext's getEngineProfile() only guards
// `typeof navigator === 'undefined'`, then calls `navigator.userAgent.includes`,
// which crashed every first measurement on RN before installPretextPolyfills
// started backfilling an empty userAgent. Isolated in its own file because the
// navigator swap is global and pretext caches its engine profile per module.

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

beforeAll(() => {
  Object.defineProperty(globalThis, 'navigator', {
    value: { product: 'ReactNative' },
    configurable: true,
    writable: true,
  });

  installPretextPolyfills();

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
  if (originalNavigator) {
    Object.defineProperty(globalThis, 'navigator', originalNavigator);
  }
});

describe('React Native navigator shape', () => {
  it('backfills an empty userAgent so the engine-profile sniff cannot crash', () => {
    expect((globalThis as { navigator?: { userAgent?: unknown } }).navigator?.userAgent).toBe('');
  });

  it('lays out text under the RN navigator without crashing', () => {
    const prepared = prepare('AAAA AAAA AAAA', '100px Test');
    const result = layout(prepared, 250, 120);
    expect(result.lineCount).toBe(3);
    expect(result.height).toBe(360);
  });
});
