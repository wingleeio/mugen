/**
 * mugen-markdown — measurable markdown for mugen.
 *
 * Markdown is parsed with [incremark](https://www.incremark.com/) into an mdast
 * tree, then rendered with **mugen primitives** so the virtualizer's tree walker
 * computes exact row heights — off-screen and never-mounted rows included, with
 * no measure-on-mount shift. Inline content (bold, italic, code, links in one
 * sentence) is measured as a single wrapping flow via a `RichText` primitive
 * built on `@chenglou/pretext`'s rich-inline layout.
 *
 * Extend it with a typed, per-node `components` map and a deep-partial `theme`;
 * every override is authored from the same primitives, so it stays measurable.
 */

// ── The component ──
export { Markdown } from './markdown';
export type { MarkdownProps } from './markdown';

// ── Functional render (return primitives directly) ──
export { renderMarkdown } from './render';
export type { RenderMarkdownOptions } from './render';

// ── Parsing (incremark) ──
export { parseMarkdown, clearParseCache } from './parse';
export type { MarkdownParseOptions } from './parse';

// ── Theme ──
export { defaultTheme, resolveTheme } from './theme';
export type { MarkdownTheme, DeepPartial } from './theme';

// ── Extending: typed components ──
export { defineMarkdownComponents } from './types';
export type {
  MarkdownComponents,
  MarkdownComponent,
  MarkdownComponentProps,
  MarkdownRenderContext,
  ResolvedMarkdownComponents,
  InlineTextOptions,
} from './types';
export { defaultComponents } from './components';

// ── Markdown primitives (compose overrides from these) ──
export { RichText, clearRichTextCache } from './primitives/rich-text';
export type { RichTextProps, RichTextRun } from './primitives/rich-text';
export { CodeBlock } from './primitives/code-block';
export type { CodeBlockProps, CodeBlockHeader } from './primitives/code-block';
export { TableBlock } from './primitives/table-block';
export type { TableBlockProps } from './primitives/table-block';

// ── Code-block syntax highlighting (non-blocking canvas overlay) ──
export { defaultTokenColors } from './highlight/types';
export type { TokenType, CodeTokenColors } from './highlight/types';
export { registerLanguage, profileFor } from './highlight/languages';
export type { LanguageProfile } from './highlight/languages';

// ── Inline pipeline (advanced) ──
export { flattenInline, baseFormat, composeFont } from './inline';
export type { InlineFormat } from './inline';

// ── Re-exported mugen primitives, for one-stop authoring of overrides ──
export { Text, VStack, HStack, definePrimitive } from '@wingleeio/mugen';
export type {
  TextProps,
  BoxProps,
  VStackProps,
  HStackProps,
  PrimitiveComponent,
  Font,
} from '@wingleeio/mugen';

// ── Re-exported mdast node types, for typing component overrides ──
export type {
  Root,
  RootContent,
  PhrasingContent,
  Paragraph,
  Heading,
  ThematicBreak,
  Blockquote,
  List,
  ListItem,
  Code,
  Table,
  TableRow,
  TableCell,
  Image,
  Link,
  Html,
} from 'mdast';
