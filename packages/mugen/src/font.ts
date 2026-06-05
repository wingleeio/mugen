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
