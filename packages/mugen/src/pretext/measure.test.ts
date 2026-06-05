import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock pretext so we can count the expensive `prepare` vs cheap `layout` calls.
vi.mock('@chenglou/pretext', () => ({
  prepare: vi.fn((text: string, font: string, opts?: unknown) => ({ __prepared: true, text, font, opts })),
  layout: vi.fn((_prepared: unknown, width: number, lineHeight: number) => ({
    height: lineHeight * Math.ceil((width || 1) / 100),
    lineCount: Math.ceil((width || 1) / 100),
  })),
  clearCache: vi.fn(),
}));

import { prepare, layout, clearCache } from '@chenglou/pretext';
import {
  assertMeasurableFont,
  clearTextCache,
  measureText,
  prepareText,
  textCacheSize,
  textHeight,
} from './measure';
import { fontEpoch, notifyFontsChanged, subscribeFonts, watchFonts } from './fonts';

const FONT = '16px Inter';

beforeEach(() => {
  clearTextCache();
  vi.mocked(prepare).mockClear();
  vi.mocked(layout).mockClear();
  vi.mocked(clearCache).mockClear();
});

describe('prepare cache (Invariant 4)', () => {
  it('runs prepare once per unique (text, font, opts)', () => {
    prepareText('hello', FONT);
    prepareText('hello', FONT);
    prepareText('hello', FONT);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(textCacheSize()).toBe(1);
  });

  it('re-measuring at a new width runs only layout, never prepare', () => {
    const prepared = prepareText('hello world', FONT);
    measureText(prepared, 100, 20);
    measureText(prepared, 240, 20);
    measureText(prepared, 999, 20);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(layout).toHaveBeenCalledTimes(3);
  });

  it('keys distinct text separately', () => {
    prepareText('a', FONT);
    prepareText('b', FONT);
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(textCacheSize()).toBe(2);
  });

  it('keys prepare-options separately', () => {
    prepareText('x', FONT);
    prepareText('x', FONT, { letterSpacing: 2 });
    prepareText('x', FONT, { whiteSpace: 'pre-wrap' });
    expect(prepare).toHaveBeenCalledTimes(3);
  });

  it('textHeight returns the laid-out height', () => {
    expect(textHeight('hi', FONT, 100, 20)).toBe(20);
    expect(textHeight('hi', FONT, 250, 20)).toBe(60); // ceil(250/100)=3 lines
  });

  it('clearTextCache forces a re-prepare and clears pretext cache', () => {
    prepareText('hello', FONT);
    expect(prepare).toHaveBeenCalledTimes(1);
    clearTextCache();
    expect(clearCache).toHaveBeenCalledTimes(1);
    prepareText('hello', FONT);
    expect(prepare).toHaveBeenCalledTimes(2);
  });
});

describe('font guard (Invariant 3)', () => {
  it('rejects system-ui', () => {
    expect(() => assertMeasurableFont('16px system-ui')).toThrow(/system-ui/);
    expect(() => assertMeasurableFont('system-ui')).toThrow();
    expect(() => prepareText('hi', '500 16px system-ui')).toThrow(/system-ui/);
  });

  it('accepts named fonts', () => {
    expect(() => assertMeasurableFont('16px Inter')).not.toThrow();
    expect(() => assertMeasurableFont('500 17px "Helvetica Neue"')).not.toThrow();
  });
});

describe('font-load invalidation', () => {
  it('notifyFontsChanged bumps the epoch, clears the cache, and notifies', () => {
    const before = fontEpoch();
    const seen = vi.fn();
    const unsub = subscribeFonts(seen);

    prepareText('hello', FONT);
    expect(prepare).toHaveBeenCalledTimes(1);

    notifyFontsChanged();

    expect(fontEpoch()).toBe(before + 1);
    expect(seen).toHaveBeenCalledTimes(1);
    // cache was cleared, so the next measure re-prepares
    prepareText('hello', FONT);
    expect(prepare).toHaveBeenCalledTimes(2);

    unsub();
    notifyFontsChanged();
    expect(seen).toHaveBeenCalledTimes(1); // no longer notified after unsubscribe
  });

  it('watchFonts invalidates when document.fonts settles', async () => {
    const before = fontEpoch();
    const fonts = {
      ready: Promise.resolve(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as FontFaceSet;

    const teardown = watchFonts(fonts);
    await fonts.ready;
    await Promise.resolve();

    expect(fontEpoch()).toBe(before + 1);
    teardown();
  });
});

afterEach(() => {
  clearTextCache();
});
