import {
  createElement,
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
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
} from '@wingleeio/mugen/native-core';
import { profileFor, type LanguageProfile } from '../highlight/languages';
import { HighlightSession, TAB_COLUMNS } from '../highlight/paint';
import { defaultTokenColors, type CodeTokenColors } from '../highlight/types';

/**
 * A fenced code block. Code does not wrap — long lines scroll horizontally — so
 * its height is simply `lineCount × lineHeight + 2 × padding` (plus an optional
 * fixed-height {@link CodeBlockHeader} bar), independent of the row width. That
 * makes it trivially and exactly measurable.
 *
 * Syntax highlighting is layered on as pure paint, never layout: the `<code>`
 * text renders immediately (plain, selectable, accessible), the language is
 * tokenized off the critical path in time-sliced chunks, and token colours are
 * painted onto canvas tiles overlaying the text — at which point the DOM text
 * turns `color: transparent` in the same frame. Highlighting therefore can't
 * block first paint and can't ever change the measured height.
 */
/**
 * Optional chrome bar above the code: the language on the left, a
 * copy-to-clipboard button on the right. Its fixed `height` is added to the
 * block's measured height, so the block still measures exactly what it paints.
 * Pure decoration otherwise — the bar never wraps and never grows.
 */
export interface CodeBlockHeader {
  /** Left-aligned label; falls back to {@link CodeBlockProps.lang}, then `code`. */
  label?: string;
  /** Fixed bar height in px (folded into the measured height). */
  height: number;
  /** Label + button font size in px. */
  fontSize: number;
  /** Monospace family for the label/button; defaults to `monospace`. */
  fontFamily?: string;
  background?: string;
  color?: string;
  borderColor?: string;
  /** Copy-button fill. */
  buttonBackground?: string;
}

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
  /** Cosmetic outer border colour, painted inset so it does not affect measurement. */
  borderColor?: string;
  /**
   * Token-colour overrides for the built-in canvas highlighter, or `false` to
   * disable it. Defaults to {@link defaultTokenColors}; only languages with a
   * registered profile are highlighted either way.
   */
  highlight?: Partial<CodeTokenColors> | false;
  /**
   * A chrome bar above the code (language label + copy button). Omit for the
   * bare `<pre>`. Its `height` is folded into the measured height.
   */
  header?: CodeBlockHeader;
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
  // The header is a fixed-height bar (it never wraps), so it adds a constant.
  const headerH = props.header ? props.header.height : 0;
  return headerH + lineCount(props.value) * props.lineHeight + 2 * pad;
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

// Legacy clipboard write for insecure contexts (a non-localhost `http://`
// origin leaves `navigator.clipboard` undefined) and for browsers that reject
// the async write when the document isn't focused. Runs inside the click's user
// gesture, so `execCommand('copy')` is permitted. Returns whether it copied.
function legacyCopy(text: string): boolean {
  if (typeof document === 'undefined') return false;
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.top = '0';
  ta.style.left = '0';
  ta.style.opacity = '0';
  ta.style.pointerEvents = 'none';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}

// Best-effort copy: the async Clipboard API when available, falling back to the
// legacy path if it's missing or rejects. Resolves to whether the text landed.
async function copyText(text: string): Promise<boolean> {
  const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
  if (clip?.writeText != null) {
    try {
      await clip.writeText(text);
      return true;
    } catch {
      // Permission denied / not focused — fall through to the legacy path.
    }
  }
  return legacyCopy(text);
}

interface CopyButtonProps {
  value: string;
  fontSize: number;
  color?: string;
  borderColor?: string;
  background?: string;
}

/** Copies the block's raw text; flips to "Copied" for ~1.6s on success. */
function CopyButton(props: CopyButtonProps): ReactElement {
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current != null) clearTimeout(timer.current);
    },
    [],
  );

  const onClick = (): void => {
    copyText(props.value)
      .then((ok) => {
        if (!ok) return;
        setCopied(true);
        if (timer.current != null) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => {});
  };

  const style: CSSProperties = {
    display: 'inline-flex',
    flex: '0 0 auto',
    alignItems: 'center',
    justifyContent: 'center',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    borderRadius: 8,
    border: `1px solid ${props.borderColor ?? 'rgba(127, 127, 127, 0.2)'}`,
    ...(props.background != null ? { background: props.background } : null),
    ...(props.color != null ? { color: props.color } : null),
    padding: '4px 9px',
    // Reserve the wider "Copied" width so the label swap never reflows the bar.
    minWidth: '4.6em',
    fontFamily: 'inherit',
    fontSize: `${props.fontSize}px`,
    lineHeight: 1,
    // Quiet at rest, full strength on hover / just-copied.
    opacity: hovered || copied ? 1 : 0.82,
    transition: 'opacity 120ms ease',
  };

  return createElement(
    'button',
    {
      type: 'button',
      onClick,
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
      'aria-label': copied ? 'Copied' : 'Copy code',
      style,
    },
    copied ? 'Copied' : 'Copy',
  );
}

interface CodeHeaderProps {
  label: string;
  value: string;
  height: number;
  fontSize: number;
  fontFamily: string;
  /** Outer corner radius — rounds the bar's top edge to match the <pre>. */
  radius?: number;
  background?: string;
  color?: string;
  borderColor?: string;
  buttonBackground?: string;
}

/** The fixed-height chrome bar: language label left, copy button right. */
function CodeHeader(props: CodeHeaderProps): ReactElement {
  const barStyle: CSSProperties = {
    display: 'flex',
    flex: '0 0 auto',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    height: `${props.height}px`,
    boxSizing: 'border-box',
    padding: '0 12px',
    fontFamily: props.fontFamily,
    ...(props.radius != null
      ? {
          borderTopLeftRadius: `${props.radius}px`,
          borderTopRightRadius: `${props.radius}px`,
        }
      : null),
    ...(props.background != null ? { background: props.background } : null),
    ...(props.borderColor != null
      ? { borderBottom: `1px solid ${props.borderColor}` }
      : null),
  };
  const labelStyle: CSSProperties = {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: `${props.fontSize}px`,
    letterSpacing: '0.02em',
    fontVariantLigatures: 'none',
    ...(props.color != null ? { color: props.color } : null),
  };
  return createElement(
    'div',
    { style: barStyle },
    createElement('span', { key: 'lang', style: labelStyle }, props.label),
    createElement(CopyButton, {
      key: 'copy',
      value: props.value,
      fontSize: props.fontSize,
      color: props.color,
      borderColor: props.borderColor,
      background: props.buttonBackground,
    }),
  );
}

function renderCodeBlock(props: CodeBlockProps): ReactElement {
  const pad = props.padding ?? 0;
  const profile = props.highlight === false ? null : profileFor(props.lang);
  const header = props.header;
  const preStyle: CSSProperties = {
    margin: 0,
    padding: `${pad}px`,
    overflowX: 'auto',
    // Line-height folded into the `font` shorthand (avoids the shorthand reset
    // and React's shorthand/longhand re-render warning).
    font: fontWithLineHeight(props.font, props.lineHeight),
    // Code shows literal characters — a programming font's `===`/`!=`/`=>`
    // ligatures are misleading in code. Inherits into the `<code>`. (The canvas
    // highlighter paints with ligatures off too; see highlight/paint.ts.)
    fontVariantLigatures: 'none',
    boxSizing: 'border-box',
    ...(props.background != null ? { background: props.background } : null),
    ...(props.color != null ? { color: props.color } : null),
    // A bare block rounds all four corners; a headered one rounds only the
    // bottom (the bar rounds the top), so the two read as one plate.
    ...(props.radius != null
      ? header == null
        ? { borderRadius: `${props.radius}px` }
        : {
            borderBottomLeftRadius: `${props.radius}px`,
            borderBottomRightRadius: `${props.radius}px`,
          }
      : null),
    ...(header == null && props.borderColor != null
      ? { boxShadow: `inset 0 0 0 1px ${props.borderColor}` }
      : null),
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

  // className lives on the outermost element — the wrapper when headered, the
  // <pre> otherwise.
  const pre = createElement(
    'pre',
    {
      ...(header == null ? { className: props.className as string | undefined } : null),
      style: preStyle,
    },
    profile == null
      ? createElement(
          'code',
          { style: codeStyle, ...(props.lang ? { 'data-lang': props.lang } : null) },
          props.value,
        )
      : createElement(HighlightedCode, {
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

  if (header == null) return pre;

  const wrapperStyle: CSSProperties = {
    ...(props.radius != null ? { borderRadius: `${props.radius}px` } : null),
    ...(props.borderColor != null ? { boxShadow: `inset 0 0 0 1px ${props.borderColor}` } : null),
  };

  // The wrapper just stacks the bar over the <pre> (no margins, so its height is
  // exactly header.height + the pre's height). Each child rounds its own outer
  // corners, so the wrapper needs no clip of its own.
  return createElement(
    'div',
    { className: props.className as string | undefined, style: wrapperStyle },
    createElement(CodeHeader, {
      key: 'header',
      label: header.label ?? props.lang ?? 'code',
      value: props.value,
      height: header.height,
      fontSize: header.fontSize,
      fontFamily: header.fontFamily ?? 'monospace',
      ...(props.radius != null ? { radius: props.radius } : null),
      background: header.background,
      color: header.color,
      borderColor: header.borderColor,
      buttonBackground: header.buttonBackground,
    }),
    pre,
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
