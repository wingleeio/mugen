/**
 * A measurable font, in canvas/CSS shorthand. pretext measures with this exact
 * string and the CSS paints with it, so it is typed to the shapes pretext can
 * measure: an optional style and/or weight, then a `size+unit`, then a family.
 *
 * Valid:   `"16px Inter"` · `"600 14px Inter"` · `"italic 500 17px Inter"`
 *          · `"15px Inter, sans-serif"`
 * Invalid: `"Inter"` (no size) · `"16 Inter"` (no unit) · `"system-ui"`
 *          (also rejected at runtime — its metrics differ per OS)
 */
export type FontSizeUnit = 'px' | 'rem' | 'em';
export type FontStyle = 'normal' | 'italic' | 'oblique';
export type FontWeight = number | 'normal' | 'bold' | 'lighter' | 'bolder';

type FontSize = `${number}${FontSizeUnit}`;
type FontFamily = string;

export type Font =
  | `${FontSize} ${FontFamily}`
  | `${FontWeight} ${FontSize} ${FontFamily}`
  | `${FontStyle} ${FontSize} ${FontFamily}`
  | `${FontStyle} ${FontWeight} ${FontSize} ${FontFamily}`;

/**
 * Fold a line-height (px) into a `font` shorthand for use in a rendered inline
 * style — e.g. `"600 16px Inter"` + 24 → `"600 16px/24px Inter"`.
 *
 * A primitive renders with the same font + line-height it measures with. Setting
 * the `font` shorthand *and* a separate `lineHeight` longhand on one element
 * makes React warn ("don't mix shorthand and non-shorthand") on every re-render
 * (e.g. while streaming), and the shorthand alone would reset line-height to
 * `normal`. Folding the line-height into the shorthand sets it in one property,
 * so there's nothing to conflict and the computed line-height is unchanged.
 */
export function fontWithLineHeight(font: string, lineHeight: number): string {
  // Insert `/<lh>px` right after the first size token (weights are unitless, so
  // they don't match the required unit and are skipped).
  return font.replace(/(\d*\.?\d+(?:px|rem|em))/, `$1/${lineHeight}px`);
}

// The measurable shorthand shape: `[style] [weight] size family`.
const FONT_SHORTHAND_RE =
  /^(?:(normal|italic|oblique)\s+)?(?:(normal|bold|lighter|bolder|\d{1,4})\s+)?(\d*\.?\d+(?:px|rem|em))\s+(.+)$/;

/**
 * Expand a measurable `font` shorthand into longhand style properties, with
 * the line-height (px) as its own longhand.
 *
 * Rendering the `font` shorthand next to the pinned shaping longhands
 * (`fontFeatureSettings`, `fontVariantLigatures`) makes React warn about
 * mixing shorthand and non-shorthand properties on every re-render (e.g.
 * while streaming). Longhands all the way down leave nothing to conflict.
 * `fontStretch` is pinned to `normal` to keep the slice of the shorthand's
 * reset that could change glyph widths under measured text; a font outside
 * the measurable shape falls back to the shorthand unchanged.
 */
export function fontLonghands(
  font: string,
  lineHeight: number,
): {
  fontStyle?: string;
  fontWeight?: string;
  fontSize?: string;
  lineHeight?: string;
  fontFamily?: string;
  fontStretch?: string;
  font?: string;
} {
  const m = FONT_SHORTHAND_RE.exec(font.trim());
  if (!m) return { font: fontWithLineHeight(font, lineHeight) };
  const [, style, weight, size, family] = m;
  return {
    fontStyle: style ?? 'normal',
    fontWeight: weight ?? 'normal',
    fontSize: size,
    lineHeight: `${lineHeight}px`,
    fontFamily: family,
    fontStretch: 'normal',
  };
}
