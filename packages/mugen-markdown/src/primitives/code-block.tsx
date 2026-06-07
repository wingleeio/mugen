import { createElement, type CSSProperties, type ReactElement } from 'react';
import {
  markPrimitive,
  assertMeasurableFont,
  fontWithLineHeight,
  type Font,
  type MeasureContext,
  type MeasurableStyle,
  type SafeClassName,
} from '@wingleeio/mugen';

/**
 * A fenced code block. Code does not wrap — long lines scroll horizontally — so
 * its height is simply `lineCount × lineHeight + 2 × padding`, independent of the
 * row width. That makes it trivially and exactly measurable, and a syntax
 * highlighter (which only recolours runs, never reflows them) can be layered on
 * by overriding the `code` component without changing the height.
 */
export interface CodeBlockProps<C extends string = string> {
  /** Raw code text. Newlines determine the line count. */
  value: string;
  /** Info-string language, if any (passed through for highlighting / labels). */
  lang?: string;
  /** Monospace font. Required. */
  font: Font;
  /** Line height in px. Required. */
  lineHeight: number;
  /** Uniform padding in px (chrome counted in the height). */
  padding?: number;
  background?: string;
  color?: string;
  radius?: number;
  style?: MeasurableStyle;
  className?: SafeClassName<C>;
}

function lineCount(value: string): number {
  // An empty `<code>` produces no line box — match the DOM (padding only).
  if (value.length === 0) return 0;
  let lines = 1;
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) === 10 /* \n */) lines++;
  }
  // A trailing newline doesn't add a visible line in a `<pre>`.
  if (value.charCodeAt(value.length - 1) === 10) lines--;
  return Math.max(1, lines);
}

function measureCodeBlock(props: CodeBlockProps, ctx: MeasureContext): number {
  void ctx; // width-independent: code scrolls horizontally, never wraps.
  assertMeasurableFont(props.font);
  const pad = props.padding ?? 0;
  return lineCount(props.value) * props.lineHeight + 2 * pad;
}

function renderCodeBlock(props: CodeBlockProps): ReactElement {
  const pad = props.padding ?? 0;
  const preStyle: CSSProperties = {
    margin: 0,
    padding: `${pad}px`,
    overflowX: 'auto',
    // Line-height folded into the `font` shorthand (avoids the shorthand reset
    // and React's shorthand/longhand re-render warning).
    font: fontWithLineHeight(props.font, props.lineHeight),
    boxSizing: 'border-box',
    ...(props.background != null ? { background: props.background } : null),
    ...(props.color != null ? { color: props.color } : null),
    ...(props.radius != null ? { borderRadius: `${props.radius}px` } : null),
    ...(props.style as CSSProperties | undefined),
  };
  const codeStyle: CSSProperties = {
    font: 'inherit',
    whiteSpace: 'pre',
    margin: 0,
    padding: 0,
  };
  return createElement(
    'pre',
    { className: props.className as string | undefined, style: preStyle },
    createElement('code', { style: codeStyle, ...(props.lang ? { 'data-lang': props.lang } : null) }, props.value),
  );
}

/** A measurable fenced-code primitive (no wrapping; height from line count). */
export const CodeBlock = markPrimitive(
  renderCodeBlock as <C extends string = string>(props: CodeBlockProps<C>) => ReactElement,
  {
    name: 'CodeBlock',
    measure: (props, ctx) => measureCodeBlock(props as unknown as CodeBlockProps, ctx),
  },
);
