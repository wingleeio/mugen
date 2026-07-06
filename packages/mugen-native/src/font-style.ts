import type { TextStyle } from 'react-native';
import { parseFontShorthand, resolveGenericFontFamily } from '@wingleeio/pretext-native';

/**
 * How a parsed font shorthand (`"600 15px Inter"`) becomes React Native
 * `TextStyle` pieces for paint.
 *
 * Measurement already went through pretext-native's registered font tables; the
 * paint must select the *same face* in the platform's font system. iOS resolves
 * `fontFamily` + `fontWeight` against a registered family; Android historically
 * wants per-weight family names (`"Inter-SemiBold"`). The resolver hook lets an
 * app own that mapping — the default emits family + numeric weight + style,
 * which is correct on iOS and on Android with variable/weight-mapped fonts.
 */
export interface FontFaceRequest {
  family: string;
  weight: number;
  style: 'normal' | 'italic';
}

export type FontFaceResolver = (req: FontFaceRequest) => TextStyle;

let resolver: FontFaceResolver = (req) => ({
  fontFamily: req.family,
  fontWeight: String(req.weight) as TextStyle['fontWeight'],
  ...(req.style === 'italic' ? { fontStyle: 'italic' as const } : null),
});

export function setFontFaceResolver(next: FontFaceResolver | null): void {
  resolver = next ?? ((req) => ({
    fontFamily: req.family,
    fontWeight: String(req.weight) as TextStyle['fontWeight'],
    ...(req.style === 'italic' ? { fontStyle: 'italic' as const } : null),
  }));
}

const cache = new Map<string, TextStyle>();

/** Resolve a font shorthand to RN text styles (fontFamily/fontSize/weight/style). */
export function fontShorthandToTextStyle(font: string): TextStyle {
  const hit = cache.get(font);
  if (hit) return hit;
  const parsed = parseFontShorthand(font);
  // A generic (`sans-serif`) resolves to the same registered family the
  // measurement used — paint and measure must pick the same face.
  const first = parsed.families[0] ?? 'System';
  const family = resolveGenericFontFamily(first) ?? first;
  const style: TextStyle = {
    fontSize: parsed.sizePx,
    ...resolver({
      family,
      weight: parsed.weight,
      style: parsed.style === 'italic' ? 'italic' : 'normal',
    }),
  };
  cache.set(font, style);
  return style;
}

/** Drop the shorthand→style cache (after swapping the resolver). */
export function clearFontStyleCache(): void {
  cache.clear();
}
