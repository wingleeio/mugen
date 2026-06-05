import type { CSSProperties } from 'react';

/**
 * Style/`className` are restricted at the type level so a primitive's painted box
 * can't diverge from the box the walker computes. Padding, margin, gap, and the
 * sizing properties are *chrome* the walker accounts for from primitive props —
 * setting them through raw CSS (or a Tailwind utility) would desync the analytic
 * height from the DOM, so both are type errors.
 */

// ── Forbidden inline-style keys ──────────────────────────────────────────────

type SpacingStyleKey =
  | 'padding'
  | 'paddingTop'
  | 'paddingRight'
  | 'paddingBottom'
  | 'paddingLeft'
  | 'paddingBlock'
  | 'paddingBlockStart'
  | 'paddingBlockEnd'
  | 'paddingInline'
  | 'paddingInlineStart'
  | 'paddingInlineEnd'
  | 'margin'
  | 'marginTop'
  | 'marginRight'
  | 'marginBottom'
  | 'marginLeft'
  | 'marginBlock'
  | 'marginBlockStart'
  | 'marginBlockEnd'
  | 'marginInline'
  | 'marginInlineStart'
  | 'marginInlineEnd'
  | 'gap'
  | 'rowGap'
  | 'columnGap'
  | 'gridGap'
  | 'gridRowGap'
  | 'gridColumnGap';

type SizingStyleKey =
  | 'width'
  | 'height'
  | 'minWidth'
  | 'maxWidth'
  | 'minHeight'
  | 'maxHeight'
  | 'blockSize'
  | 'inlineSize'
  | 'minBlockSize'
  | 'maxBlockSize'
  | 'minInlineSize'
  | 'maxInlineSize';

/** `CSSProperties` minus the keys a primitive owns through its props. */
export type MeasurableStyle = Omit<CSSProperties, SpacingStyleKey | SizingStyleKey>;

// ── Forbidden className utilities ─────────────────────────────────────────────

// Tailwind-ish spacing/sizing prefixes. A class is flagged when one of these is
// followed by `-` at a word boundary (start, after a space, or after `-` so that
// negative variants like `-mx-2` are caught too).
type BadPrefix =
  | 'p' | 'px' | 'py' | 'pt' | 'pr' | 'pb' | 'pl' | 'ps' | 'pe'
  | 'm' | 'mx' | 'my' | 'mt' | 'mr' | 'mb' | 'ml' | 'ms' | 'me'
  | 'gap' | 'gap-x' | 'gap-y'
  | 'space-x' | 'space-y'
  | 'w' | 'h' | 'size'
  | 'min-w' | 'max-w' | 'min-h' | 'max-h';

type BadToken = `${BadPrefix}-${string}`;

type ContainsBadClass<S extends string> = S extends BadToken
  ? true
  : S extends `${string} ${BadToken}`
    ? true
    : S extends `${string}-${BadToken}`
      ? true
      : false;

/** The error surfaced when a forbidden utility class is detected. */
type ClassError =
  'mugen: spacing/sizing utility classes (p-, m-, gap-, w-, h-, …) break analytic measurement — set padding/gap/width/height via primitive props instead';

/**
 * Resolves to the className string when it is measurement-safe, or to a
 * descriptive error literal (which the literal won't be assignable to) when it
 * contains a spacing/sizing utility. Only string *literals* are checked; a
 * dynamic `string` passes through.
 */
export type SafeClassName<S extends string> = ContainsBadClass<S> extends true ? ClassError : S;
