import {
  createElement,
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactElement,
} from 'react';
import {
  markPrimitive,
  assertMeasurableFont,
  fontWithLineHeight,
  type Font,
  type MeasureContext,
  type MeasurableStyle,
  type SafeClassName,
} from '@wingleeio/mugen';
import { profileFor, type LanguageProfile } from '../highlight/languages';
import { HighlightSession, TAB_COLUMNS } from '../highlight/paint';
import { defaultTokenColors, type CodeTokenColors } from '../highlight/types';

/**
 * A fenced code block. Code does not wrap — long lines scroll horizontally — so
 * its height is simply `lineCount × lineHeight + 2 × padding`, independent of the
 * row width. That makes it trivially and exactly measurable.
 *
 * Syntax highlighting is layered on as pure paint, never layout: the `<code>`
 * text renders immediately (plain, selectable, accessible), the language is
 * tokenized off the critical path in time-sliced chunks, and token colours are
 * painted onto canvas tiles overlaying the text — at which point the DOM text
 * turns `color: transparent` in the same frame. Highlighting therefore can't
 * block first paint and can't ever change the measured height.
 */
export interface CodeBlockProps<C extends string = string> {
  /** Raw code text. Newlines determine the line count. */
  value: string;
  /** Info-string language, if any (drives the built-in highlighter / labels). */
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
  /**
   * Token-colour overrides for the built-in canvas highlighter, or `false` to
   * disable it. Defaults to {@link defaultTokenColors}; only languages with a
   * registered profile are highlighted either way.
   */
  highlight?: Partial<CodeTokenColors> | false;
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

// Resolve identical override objects once, so the session's colour identity is
// stable across renders and streaming ticks don't force full repaints.
const colorsCache = new WeakMap<object, CodeTokenColors>();
function resolveTokenColors(overrides: Partial<CodeTokenColors> | undefined): CodeTokenColors {
  if (overrides == null) return defaultTokenColors;
  let full = colorsCache.get(overrides);
  if (full === undefined) {
    full = { ...defaultTokenColors, ...overrides };
    colorsCache.set(overrides, full);
  }
  return full;
}

// useLayoutEffect so streamed appends repaint the canvas in the same frame the
// new (transparent) text commits; falls back on the server to avoid the warning.
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

interface HighlightedCodeProps {
  value: string;
  lang: string | undefined;
  font: Font;
  lineHeight: number;
  padding: number;
  profile: LanguageProfile;
  colors: CodeTokenColors;
  codeStyle: CSSProperties;
}

function HighlightedCode(props: HighlightedCodeProps): ReactElement {
  const codeRef = useRef<HTMLElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<HighlightSession | null>(null);
  const { value, font, lineHeight, profile, colors } = props;

  useIsoLayoutEffect(() => {
    const codeEl = codeRef.current;
    const overlayEl = overlayRef.current;
    if (codeEl == null || overlayEl == null) return;
    (sessionRef.current ??= new HighlightSession()).update({
      codeEl,
      overlayEl,
      value,
      font,
      lineHeight,
      profile,
      colors,
    });
  }, [value, font, lineHeight, profile, colors]);

  useEffect(
    () => () => {
      sessionRef.current?.destroy();
      sessionRef.current = null;
    },
    [],
  );

  // The session toggles `visibility` imperatively; React leaves that mutation
  // alone because the declared value below never changes between renders.
  const overlayStyle: CSSProperties = {
    position: 'absolute',
    top: `${props.padding}px`,
    left: `${props.padding}px`,
    width: 0,
    height: 0,
    visibility: 'hidden',
    pointerEvents: 'none',
  };

  return createElement(
    Fragment,
    null,
    createElement(
      'code',
      {
        ref: codeRef,
        style: props.codeStyle,
        ...(props.lang != null ? { 'data-lang': props.lang } : null),
      },
      props.value,
    ),
    createElement('div', { ref: overlayRef, 'aria-hidden': true, style: overlayStyle }),
  );
}

function renderCodeBlock(props: CodeBlockProps): ReactElement {
  const pad = props.padding ?? 0;
  const profile = props.highlight === false ? null : profileFor(props.lang);
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
    // The overlay positions against the padding box, and the painter computes
    // tab stops itself — pin `tab-size` so page CSS can't desynchronise them.
    ...(profile != null ? { position: 'relative' as const, tabSize: TAB_COLUMNS } : null),
    ...(props.style as CSSProperties | undefined),
  };
  const codeStyle: CSSProperties = {
    font: 'inherit',
    whiteSpace: 'pre',
    margin: 0,
    padding: 0,
  };
  if (profile == null) {
    return createElement(
      'pre',
      { className: props.className as string | undefined, style: preStyle },
      createElement(
        'code',
        { style: codeStyle, ...(props.lang ? { 'data-lang': props.lang } : null) },
        props.value,
      ),
    );
  }
  return createElement(
    'pre',
    { className: props.className as string | undefined, style: preStyle },
    createElement(HighlightedCode, {
      value: props.value,
      lang: props.lang,
      font: props.font,
      lineHeight: props.lineHeight,
      padding: pad,
      profile,
      colors: resolveTokenColors(props.highlight === false ? undefined : props.highlight),
      codeStyle,
    }),
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
