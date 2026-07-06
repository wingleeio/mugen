import {
  installPretextPolyfills,
  registerFont,
  setGenericFontFamily,
  type RegisterFontOptions,
} from '@wingleeio/pretext-native';
import { notifyFontsChanged } from '@wingleeio/mugen/native-core';
import { setFontFaceResolver, clearFontStyleCache, type FontFaceResolver } from './font-style';

export interface ConfigureMugenNativeOptions {
  /**
   * Font tables to measure against — the same files the app registers with the
   * platform (`expo-font` / native assets), handed over as binary data so
   * pretext-native can read glyph advances. Measurement and paint then share
   * one source of truth: the font file itself.
   */
  fonts?: RegisterFontOptions[];
  /** Map CSS generic families (`sans-serif`, `monospace`) to registered ones. */
  genericFamilies?: Partial<
    Record<'sans-serif' | 'serif' | 'monospace' | 'system-ui', string>
  >;
  /** Advance width for emoji not covered by a registered font, in em. Default 1. */
  emojiAdvanceEm?: number;
  /**
   * How a `{family, weight, style}` face request becomes RN `TextStyle` for
   * paint — override on Android when weights map to per-face family names
   * (`Inter-SemiBold`). Default: `{fontFamily, fontWeight, fontStyle}`.
   */
  fontFaceResolver?: FontFaceResolver;
}

/**
 * One-call setup for mugen on React Native / Hermes:
 *
 * 1. Installs the pretext polyfills (a pure-JS `measureText` canvas shim backed
 *    by the registered font tables, and an `Intl.Segmenter` fallback when the
 *    engine lacks one).
 * 2. Registers the given fonts for measurement.
 * 3. Bumps the font epoch so any mounted lists drop their text caches and
 *    re-measure — the RN analog of the web's `document.fonts` settle.
 *
 * Call it at app startup, before the first list renders (and again if fonts
 * load later — re-measurement is handled).
 */
export function configureMugenNative(options: ConfigureMugenNativeOptions = {}): void {
  installPretextPolyfills(
    options.emojiAdvanceEm != null ? { emojiAdvanceEm: options.emojiAdvanceEm } : undefined,
  );
  for (const font of options.fonts ?? []) registerFont(font);
  if (options.genericFamilies) {
    for (const [generic, family] of Object.entries(options.genericFamilies)) {
      if (family) {
        setGenericFontFamily(generic as 'sans-serif' | 'serif' | 'monospace' | 'system-ui', family);
      }
    }
  }
  if (options.fontFaceResolver) {
    setFontFaceResolver(options.fontFaceResolver);
    clearFontStyleCache();
  }
  notifyFontsChanged();
}
