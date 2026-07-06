import {
  defaultTheme,
  resolveTheme,
  type DeepPartial,
  type MarkdownTheme,
} from '@wingleeio/mugen-markdown/native-core';

export { defaultTheme, resolveTheme };
export type { DeepPartial, MarkdownTheme };

/**
 * Resolve the web theme's CSS colour sentinels to a concrete native colour.
 * React Native `Text` doesn't inherit colour from ancestor Views, so
 * `'inherit'` / `'currentColor'` must bottom out somewhere — the theme's own
 * `color`, or black. Every *height-affecting* value stays identical to the
 * web default theme; only colour resolution differs.
 */
export function resolveColor(color: string | undefined, theme: MarkdownTheme): string | undefined {
  if (color == null) return undefined;
  if (color === 'inherit' || color === 'currentColor') {
    return theme.color === 'inherit' ? '#000000' : theme.color;
  }
  return color;
}
