/** A max-content-width token: px number, a rem/px string, or a named size. */
export type MaxWidth = number | string | undefined;

// Named max-widths (rem), mirroring a common Tailwind-ish scale.
const NAMED_REM: Record<string, number> = {
  sm: 24,
  md: 28,
  lg: 32,
  xl: 36,
  '2xl': 42,
  '3xl': 48,
  '4xl': 56,
  '5xl': 64,
  '6xl': 72,
  '7xl': 80,
};

/** Live root font-size in px, so `maxW` rem values track zoom (Invariant: rem/zoom drift). */
export function rootFontSizePx(): number {
  if (typeof document === 'undefined' || typeof getComputedStyle === 'undefined') return 16;
  const fs = parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(fs) && fs > 0 ? fs : 16;
}

/** Resolve a `maxW` token (px number, rem/px string, or named) to px. `undefined` → Infinity. */
export function resolveMaxWidthPx(maxW: MaxWidth, rootPx: number): number {
  if (maxW == null) return Number.POSITIVE_INFINITY;
  if (typeof maxW === 'number') return maxW;
  const named = NAMED_REM[maxW];
  if (named != null) return named * rootPx;
  const match = /^([\d.]+)(rem|px)?$/.exec(maxW.trim());
  if (match) {
    const n = parseFloat(match[1]!);
    return match[2] === 'rem' ? n * rootPx : n;
  }
  return Number.POSITIVE_INFINITY;
}

/** Content width available to rows = min(viewport, maxW). Per-row chrome is subtracted by primitives. */
export function contentWidth(viewportWidth: number, maxW: MaxWidth, rootPx: number): number {
  return Math.max(0, Math.min(viewportWidth, resolveMaxWidthPx(maxW, rootPx)));
}
