import { useContext, type CSSProperties, type ReactElement } from 'react';
import { markPrimitive, type MeasureContext } from './core';
import { measureText, naturalWidth, prepareText, type PrepareOptions } from '../pretext/measure';
import { fontLonghands } from '../font';
import {
  TextDefaultsContext,
  type Font,
  type TextDefaults,
  type WhiteSpaceMode,
  type WordBreakMode,
} from '../text-defaults';
import type { MeasurableStyle, SafeClassName } from '../style';

export interface TextProps<C extends string = string> {
  children: string;
  /** Font shorthand — falls back to the list default; never `system-ui`. */
  font?: Font;
  lineHeight?: number;
  letterSpacing?: number;
  whiteSpace?: WhiteSpaceMode;
  wordBreak?: WordBreakMode;
  color?: string;
  /** Shrink-wrap to the text's natural width (bubble style), capped at the row width. */
  shrink?: boolean;
  style?: MeasurableStyle;
  className?: SafeClassName<C>;
}

interface ResolvedText {
  font: string;
  lineHeight: number;
  opts: PrepareOptions;
  letterSpacing?: number;
  whiteSpace: WhiteSpaceMode;
  wordBreak: WordBreakMode;
}

function resolveText(props: TextProps, defaults: TextDefaults): ResolvedText {
  const font = props.font ?? defaults.font;
  if (font == null) {
    throw new Error(
      'mugen: <Text> needs a font — set `font` on the <Text> or as a default on <MugenVList>.',
    );
  }
  const lineHeight = props.lineHeight ?? defaults.lineHeight;
  if (lineHeight == null) {
    throw new Error(
      'mugen: <Text> needs a lineHeight — set `lineHeight` on the <Text> or as a default on <MugenVList>.',
    );
  }
  const letterSpacing = props.letterSpacing ?? defaults.letterSpacing;
  const whiteSpace = props.whiteSpace ?? defaults.whiteSpace ?? 'normal';
  const wordBreak = props.wordBreak ?? defaults.wordBreak ?? 'normal';
  const opts: PrepareOptions = { whiteSpace, wordBreak };
  if (letterSpacing != null) opts.letterSpacing = letterSpacing;
  return { font, lineHeight, opts, letterSpacing, whiteSpace, wordBreak };
}

function TextComponent(props: TextProps): ReactElement {
  const r = resolveText(props, useContext(TextDefaultsContext));
  // The font is expanded to longhands (fontSize, lineHeight, …) rather than the
  // `font` shorthand: a shorthand next to the shaping longhands below makes
  // React warn about mixing shorthand and non-shorthand on every re-render.
  const style: CSSProperties = {
    ...fontLonghands(r.font, r.lineHeight),
    whiteSpace: r.whiteSpace,
    wordBreak: r.wordBreak,
    // Match pretext, which breaks a word that can't fit rather than overflow.
    overflowWrap: 'anywhere',
    margin: 0,
    padding: 0,
    // Pin text shaping to the canvas defaults pretext measures with, so page
    // CSS (e.g. a global `code { font-feature-settings: 'liga' 0 }`) can't
    // change glyph widths under the measured text and shift its wrapping.
    fontVariantLigatures: 'normal',
    fontFeatureSettings: 'normal',
    letterSpacing: r.letterSpacing != null ? `${r.letterSpacing}px` : 'normal',
    ...(props.shrink ? { width: 'fit-content', maxWidth: '100%' } : null),
    ...(props.color != null ? { color: props.color } : null),
    ...(props.style as CSSProperties | undefined),
  };
  return (
    <div className={props.className as string | undefined} style={style}>
      {props.children}
    </div>
  );
}
TextComponent.displayName = 'Text';

/**
 * The only primitive that calls pretext. Its measured height is
 * `layout(prepare(text, font, opts), width, lineHeight).height`; its rendered
 * CSS uses the identical font/line-height/spacing so the two agree. `font` /
 * `lineHeight` fall back to the list defaults from `<MugenVList>`.
 */
export const Text = markPrimitive(
  TextComponent as <C extends string = string>(props: TextProps<C>) => ReactElement,
  {
    name: 'Text',
    measure(props, ctx: MeasureContext) {
      const p = props as unknown as TextProps;
      if (typeof p.children !== 'string') {
        throw new Error('mugen: <Text> children must be a single string.');
      }
      const r = resolveText(p, ctx.defaults);
      const width = p.shrink
        ? Math.min(ctx.width, Math.ceil(naturalWidth(p.children, r.font, r.opts)))
        : ctx.width;
      return measureText(prepareText(p.children, r.font, r.opts), width, r.lineHeight).height;
    },
    naturalWidth(props, ctx: MeasureContext) {
      const p = props as unknown as TextProps;
      if (typeof p.children !== 'string') return null;
      const r = resolveText(p, ctx.defaults);
      return naturalWidth(p.children, r.font, r.opts);
    },
  },
);
