import { defaultTokenColors, type CodeTokenColors } from './highlight/types';

/**
 * The markdown theme. Every value that affects a box's height — fonts, line
 * heights, paddings, gaps — lives here as a concrete number/family, because the
 * dispatcher bakes them into primitive props (the measure walk only sees props,
 * never React context). Colours and other purely-cosmetic values live here too,
 * for one-stop styling.
 *
 * Fonts are given as a **family** plus sizes/weights, not as full `Font`
 * shorthands, so the dispatcher can compose inline variants (bold inside a
 * heading, code inside a paragraph) without you spelling out every combination.
 * Families must be measurable — a named web font (`"Inter"`) or a canvas-safe
 * generic (`"sans-serif"`, `"monospace"`); `"system-ui"` is rejected at measure
 * time because its canvas metrics drift from what CSS paints.
 */
export interface MarkdownTheme {
  /** Body text family, e.g. `"Inter"` or `"sans-serif"`. */
  fontFamily: string;
  /** Monospace family for code, e.g. `"JetBrains Mono"` or `"monospace"`. */
  monoFamily: string;
  /** Body font size in px. */
  fontSize: number;
  /** Body line height in px. */
  lineHeight: number;
  /** Default text colour (any CSS colour; `"inherit"` follows the surrounding CSS). */
  color: string;
  /** Vertical gap between adjacent blocks, in px. */
  blockGap: number;

  heading: {
    weight: number;
    color: string;
    /** Font size per heading depth, in px. */
    sizes: Record<1 | 2 | 3 | 4 | 5 | 6, number>;
    /** Line height per heading depth, in px. */
    lineHeights: Record<1 | 2 | 3 | 4 | 5 | 6, number>;
  };

  /** Weight applied to `**strong**` text. */
  strongWeight: number;
  /** Whether `*emphasis*` renders italic (needs an italic face of the family). */
  emphasisItalic: boolean;

  link: { color: string; underline: boolean };

  inlineCode: {
    color: string;
    background: string;
    /** Inline-code size as a fraction of the surrounding text size. */
    sizeScale: number;
  };

  code: {
    fontSize: number;
    lineHeight: number;
    padding: number;
    background: string;
    color: string;
    radius: number;
    /**
     * Token palette for the built-in non-blocking canvas highlighter, or
     * `false` to disable highlighting. Colours are paint-only — they can never
     * change a block's measured height.
     */
    highlight: CodeTokenColors | false;
    /**
     * Optional chrome bar above the code — the language on the left, a
     * copy-to-clipboard button on the right. `show: false` (the default) keeps
     * the bare `<pre>`. When shown, the bar's fixed `height` is folded into the
     * block's measured height, so computed and painted heights stay identical.
     */
    header: {
      /** Render the chrome bar. Off by default. */
      show: boolean;
      /** Fixed bar height in px (counted in the measured height). */
      height: number;
      /** Label + button font size in px. */
      fontSize: number;
      /** Bar background. */
      background: string;
      /** Label + button text colour. */
      color: string;
      /** Bottom hairline + button border colour. */
      borderColor: string;
      /** Copy-button fill. */
      buttonBackground: string;
    };
  };

  blockquote: {
    padding: number;
    gap: number;
    borderWidth: number;
    borderColor: string;
    color: string;
  };

  list: {
    /** Gap between list items, in px. */
    gap: number;
    /** Width of the marker column (bullet / number), in px. */
    indent: number;
    markerColor: string;
  };

  table: {
    /** Uniform cell padding in px (uniform so the analytic height stays exact). */
    cellPadding: number;
    /** Hairline between rows (and the outer ring) in px; 0 disables both. */
    gap: number;
    headerWeight: number;
    /** Background behind the header row. */
    headerBackground: string;
    /** Hairline / outer-ring colour. */
    borderColor: string;
    /** Corner radius in px (clip only — no height impact). */
    radius: number;
  };

  rule: { thickness: number; color: string; gap: number };

  /**
   * Images have no intrinsic measurable height, so the default `image` component
   * renders a fixed-height box. Override the `image` component for real layout.
   */
  image: { placeholderHeight: number; color: string };
}

export type DeepPartial<T> = T extends (infer U)[]
  ? DeepPartial<U>[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

export const defaultTheme: MarkdownTheme = {
  fontFamily: 'sans-serif',
  monoFamily: 'monospace',
  fontSize: 16,
  lineHeight: 26,
  color: 'inherit',
  blockGap: 16,

  heading: {
    weight: 650,
    color: 'inherit',
    sizes: { 1: 32, 2: 26, 3: 21, 4: 18, 5: 16, 6: 15 },
    lineHeights: { 1: 40, 2: 34, 3: 28, 4: 26, 5: 24, 6: 22 },
  },

  strongWeight: 700,
  emphasisItalic: true,

  link: { color: '#2563eb', underline: true },

  inlineCode: {
    color: 'inherit',
    background: 'rgba(127, 127, 127, 0.16)',
    sizeScale: 0.9,
  },

  code: {
    fontSize: 13.5,
    lineHeight: 21,
    padding: 14,
    background: 'rgba(127, 127, 127, 0.12)',
    color: 'inherit',
    radius: 8,
    highlight: defaultTokenColors,
    header: {
      show: false,
      height: 38,
      fontSize: 12,
      background: 'rgba(127, 127, 127, 0.06)',
      color: 'rgba(127, 127, 127, 0.85)',
      borderColor: 'rgba(127, 127, 127, 0.18)',
      buttonBackground: 'rgba(127, 127, 127, 0.04)',
    },
  },

  blockquote: {
    padding: 14,
    gap: 12,
    borderWidth: 3,
    borderColor: 'rgba(127, 127, 127, 0.4)',
    color: 'inherit',
  },

  list: { gap: 6, indent: 28, markerColor: 'inherit' },

  table: {
    cellPadding: 8,
    gap: 1,
    headerWeight: 650,
    headerBackground: 'rgba(127, 127, 127, 0.12)',
    borderColor: 'rgba(127, 127, 127, 0.35)',
    radius: 8,
  },

  rule: { thickness: 1, color: 'rgba(127, 127, 127, 0.4)', gap: 8 },

  image: { placeholderHeight: 0, color: 'rgba(127, 127, 127, 0.7)' },
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function deepMerge<T>(base: T, patch: unknown): T {
  if (!isObject(patch)) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const key of Object.keys(patch)) {
    const b = (base as Record<string, unknown>)[key];
    const p = patch[key];
    out[key] = isObject(b) && isObject(p) ? deepMerge(b, p) : p;
  }
  return out as T;
}

// Resolve identical theme-input objects once (the same `theme` prop is read in
// both the measure walk and the render). Falls back to the shared default when
// no theme is supplied.
const resolveCache = new WeakMap<object, MarkdownTheme>();

/** Merge a partial theme over the defaults into a fully-resolved theme. */
export function resolveTheme(theme?: DeepPartial<MarkdownTheme>): MarkdownTheme {
  if (theme == null) return defaultTheme;
  const cached = resolveCache.get(theme);
  if (cached !== undefined) return cached;
  const resolved = deepMerge(defaultTheme, theme);
  resolveCache.set(theme, resolved);
  return resolved;
}
