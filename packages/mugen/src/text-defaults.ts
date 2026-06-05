import { createContext } from 'react';
import type { Font } from './font';

export type { Font };
export type WhiteSpaceMode = 'normal' | 'pre-wrap';
export type WordBreakMode = 'normal' | 'keep-all';

/**
 * List-level text defaults. `<MugenVList>` supplies these so a `<Text>` doesn't
 * have to repeat `font`/`lineHeight` on every node; any `Text` prop overrides
 * its matching default. The same object feeds the measure walk and the rendered
 * CSS, so analytic heights can't drift from what the browser paints (Invariant:
 * one description measures and renders).
 *
 * - **Prepare-tokens** (`font`, `letterSpacing`, `whiteSpace`, `wordBreak`)
 *   invalidate pretext's prepare cache when they change.
 * - **Layout-token** (`lineHeight`) is cheap and re-runs on resize.
 */
export interface TextDefaults {
  /** Canvas/CSS font shorthand, e.g. `"16px Inter"` or `"500 17px Inter"`. */
  font?: Font;
  /** Line height in px (matches CSS `line-height: <n>px`). */
  lineHeight?: number;
  /** CSS `letter-spacing` in px. */
  letterSpacing?: number;
  whiteSpace?: WhiteSpaceMode;
  wordBreak?: WordBreakMode;
}

/** Resolved text defaults, provided to `Text`'s `render()` via context. */
export const TextDefaultsContext = createContext<TextDefaults>({});
