import type { PhrasingContent } from 'mdast';
import type { Font } from '@wingleeio/mugen';
import type { MarkdownTheme } from './theme';
import type { RichTextRun } from './primitives/rich-text';

/**
 * The mutable styling state threaded through the inline walk. Markdown inline
 * marks (`**`, `*`, `` ` ``, `[]()`) nest, so we carry the composed format down
 * and emit a styled run at each text leaf. Fonts are composed here — a `<strong>`
 * inside a heading produces one bold run at the heading's size — which is what
 * lets the rich-inline measurement see every mixed font exactly.
 */
export interface InlineFormat {
  family: string;
  monoFamily: string;
  size: number;
  weight: number;
  italic: boolean;
  mono: boolean;
  underline: boolean;
  strike: boolean;
  color?: string;
  background?: string;
  href?: string;
}

/** A base format for body text at a given size/weight/colour. */
export function baseFormat(
  theme: MarkdownTheme,
  opts: { size?: number; weight?: number; color?: string } = {},
): InlineFormat {
  return {
    family: theme.fontFamily,
    monoFamily: theme.monoFamily,
    size: opts.size ?? theme.fontSize,
    weight: opts.weight ?? 400,
    italic: false,
    mono: false,
    underline: false,
    strike: false,
    color: opts.color ?? (theme.color !== 'inherit' ? theme.color : undefined),
  };
}

/** Compose a measurable `Font` shorthand from a format. */
export function composeFont(fmt: InlineFormat): Font {
  const family = fmt.mono ? fmt.monoFamily : fmt.family;
  const style = fmt.italic ? 'italic ' : '';
  return `${style}${fmt.weight} ${fmt.size}px ${family}` as Font;
}

function pushRun(out: RichTextRun[], text: string, fmt: InlineFormat): void {
  if (text.length === 0) return;
  const run: RichTextRun = { text, font: composeFont(fmt) };
  if (fmt.color != null) run.color = fmt.color;
  if (fmt.background != null) run.background = fmt.background;
  const decoration = [fmt.underline ? 'underline' : '', fmt.strike ? 'line-through' : '']
    .filter(Boolean)
    .join(' ');
  if (decoration) run.decoration = decoration;
  if (fmt.href != null) {
    run.href = fmt.href;
    run.as = 'a';
  } else if (fmt.mono) {
    run.as = 'code';
  }
  out.push(run);
}

/**
 * Flatten phrasing content into styled runs. Recursive over the inline marks;
 * the result feeds a single `<RichText>` so the whole paragraph wraps as one
 * flow and measures exactly.
 */
export function flattenInline(
  nodes: readonly PhrasingContent[],
  fmt: InlineFormat,
  theme: MarkdownTheme,
  out: RichTextRun[],
): void {
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
        pushRun(out, node.value, fmt);
        break;
      case 'strong':
        flattenInline(node.children, { ...fmt, weight: theme.strongWeight }, theme, out);
        break;
      case 'emphasis':
        flattenInline(
          node.children,
          { ...fmt, italic: theme.emphasisItalic ? true : fmt.italic },
          theme,
          out,
        );
        break;
      case 'delete':
        flattenInline(node.children, { ...fmt, strike: true }, theme, out);
        break;
      case 'inlineCode':
        pushRun(out, node.value, {
          ...fmt,
          mono: true,
          size: Math.round(fmt.size * theme.inlineCode.sizeScale),
          color: theme.inlineCode.color !== 'inherit' ? theme.inlineCode.color : fmt.color,
          background: theme.inlineCode.background,
        });
        break;
      case 'link':
        flattenInline(
          node.children,
          {
            ...fmt,
            href: node.url,
            color: theme.link.color,
            underline: theme.link.underline ? true : fmt.underline,
          },
          theme,
          out,
        );
        break;
      case 'linkReference':
        // No definition resolution in v1 — render the visible children as text.
        flattenInline(node.children, fmt, theme, out);
        break;
      case 'break':
        out.push({ text: '', break: true });
        break;
      case 'image':
        if (node.alt) pushRun(out, node.alt, { ...fmt, color: theme.image.color });
        break;
      case 'imageReference':
        if (node.alt) pushRun(out, node.alt, { ...fmt, color: theme.image.color });
        break;
      case 'footnoteReference':
        pushRun(out, `[${node.label ?? node.identifier}]`, { ...fmt, color: theme.link.color });
        break;
      default:
        // `html`, `inlineMath`, directives, etc.: recurse into children if any,
        // otherwise drop (raw inline HTML is not measurable as styled text).
        if ('children' in node && Array.isArray(node.children)) {
          flattenInline(node.children as PhrasingContent[], fmt, theme, out);
        }
        break;
    }
  }
}
