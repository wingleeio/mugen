// @wingleeio/pretext-native — React Native / Hermes measurement backend for
// @chenglou/pretext.
//
// pretext measures text through exactly two platform capabilities:
//   1. a canvas 2D context (font setter + measureText().width), and
//   2. Intl.Segmenter (word + grapheme granularity).
// Hermes has neither. This package supplies both: a fake OffscreenCanvas
// whose measureText is computed analytically from the font binaries the app
// already bundles (advance widths + pair kerning from TTF/OTF tables), and a
// pure-JS UAX#29-lite segmenter.
//
// Typical setup:
//
//   import { installPretextPolyfills, registerFont } from '@wingleeio/pretext-native';
//   installPretextPolyfills();
//   registerFont({ family: 'Inter', data: interTtfBytes });
//   // ...then use @chenglou/pretext as usual.

import { OffscreenCanvasShim } from './engine/canvas-shim.js';
import { setEmojiAdvanceEm } from './engine/measure.js';
import { PretextSegmenter } from './segmenter/segmenter.js';

export {
  registerFont,
  clearRegisteredFonts,
  getRegisteredFonts,
  setGenericFontFamily,
  resolveGenericFontFamily,
} from './engine/registry.js';
export type { RegisterFontOptions, ParsedFontInfo } from './engine/registry.js';
export { measureTextWidth, setEmojiAdvanceEm } from './engine/measure.js';
export { parseFontShorthand } from './engine/shorthand.js';
export type { ParsedShorthand, FontStyle } from './engine/shorthand.js';
export { OffscreenCanvasShim, MeasureContext2D } from './engine/canvas-shim.js';
export { PretextSegmenter } from './segmenter/segmenter.js';
export type {
  PretextSegmentData,
  PretextSegmenterGranularity,
  PretextSegmenterOptions,
} from './segmenter/segmenter.js';
export { parseFont } from './sfnt/parse.js';
export type { ParsedFont } from './sfnt/parse.js';

export type InstallPretextPolyfillsOptions = {
  /**
   * Advance width (in em) assumed for emoji that no registered font maps.
   * Platform color-emoji fonts are ~1em per emoji; tweak if your target
   * platform measures differently.
   */
  emojiAdvanceEm?: number;
  /** Install the shims even when a native implementation exists. */
  force?: { canvas?: boolean; segmenter?: boolean };
};

export type InstallPretextPolyfillsResult = {
  canvasInstalled: boolean;
  segmenterInstalled: boolean;
};

// This tsconfig compiles without the DOM lib (deliberately — see
// tsconfig.json), so the browser-ish globals we may touch are typed narrowly
// right here instead of pulling in lib.dom.
type PolyfillTarget = {
  OffscreenCanvas?: unknown;
  Intl?: { Segmenter?: unknown };
};

/**
 * Install the OffscreenCanvas measurement shim and/or the Intl.Segmenter
 * fallback onto globalThis. Native implementations are respected unless
 * `force` says otherwise; calling this repeatedly is a no-op after the first
 * effective install.
 *
 * IMPORTANT: run this BEFORE the first pretext measurement. pretext caches
 * its canvas context and segmenter instances in module-level variables, so a
 * late install won't be picked up until pretext's clearCache() is called.
 */
export function installPretextPolyfills(
  options?: InstallPretextPolyfillsOptions,
): InstallPretextPolyfillsResult {
  if (options?.emojiAdvanceEm !== undefined) {
    setEmojiAdvanceEm(options.emojiAdvanceEm);
  }

  const g = globalThis as unknown as PolyfillTarget;

  if (typeof g.OffscreenCanvas === 'undefined' || options?.force?.canvas === true) {
    g.OffscreenCanvas = OffscreenCanvasShim;
  }

  // Hermes builds can lack Intl entirely (RN's intl:false flavor); create the
  // namespace so the segmenter has somewhere to live.
  if (g.Intl === undefined) {
    g.Intl = {};
  }
  if (typeof g.Intl.Segmenter === 'undefined' || options?.force?.segmenter === true) {
    g.Intl.Segmenter = PretextSegmenter;
  }

  return {
    canvasInstalled: g.OffscreenCanvas === OffscreenCanvasShim,
    segmenterInstalled: g.Intl.Segmenter === PretextSegmenter,
  };
}
