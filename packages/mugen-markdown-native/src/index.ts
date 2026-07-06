/**
 * mugen-markdown-native — measurable markdown for mugen on React Native.
 *
 * The pipeline is the web package's, imported (not forked): incremark parsing
 * with streaming caches, the mdast→runs inline flattener, the theme, the
 * dispatcher with its two-tier block memoization, and the syntax tokenizer.
 * What's native is the paint: `RichText` places pretext's materialized line
 * fragments at their exact measured x/y, `CodeBlock` renders tokenizer-colored
 * lines in a horizontal ScrollView, `TableBlock` resolves the shared column
 * ratios to pixel widths, and `FadeMarkdown` animates new lines' opacity.
 * Same theme, same math, same heights as the web.
 */

// ── The component ──
export { Markdown, renderMarkdown } from './markdown';
export type { MarkdownProps, RenderMarkdownOptions } from './markdown';

// ── Parsing (shared with the web) ──
export { parseMarkdown, clearParseCache } from '@wingleeio/mugen-markdown/native-core';
export type { MarkdownParseOptions } from '@wingleeio/mugen-markdown/native-core';

// ── Theme (shared, plus native colour resolution) ──
export { defaultTheme, resolveTheme, resolveColor } from './theme';
export type { MarkdownTheme, DeepPartial } from './theme';

// ── Extending: typed components ──
export { defineMarkdownComponents, defaultNativeComponents, mergeNativeComponents } from './components';
export type {
  MarkdownComponents,
  MarkdownComponent,
  MarkdownComponentProps,
  MarkdownRenderContext,
  ResolvedMarkdownComponents,
  InlineTextOptions,
  InlineComponents,
  InlineComponent,
  InlineRenderContext,
} from '@wingleeio/mugen-markdown/native-core';

// ── Markdown primitives (compose overrides from these) ──
export { RichText, clearRichTextCache, measureInline } from './primitives/rich-text';
export type { RichTextProps, RichTextRun } from './primitives/rich-text';
export { CodeBlock, setCodeCopyHandler } from './primitives/code-block';
export type { CodeBlockProps, CodeBlockHeader } from './primitives/code-block';
export { TableBlock } from './primitives/table-block';
export type { TableBlockProps } from './primitives/table-block';
export { FadeMarkdown } from './primitives/fade';

// ── Code-block syntax highlighting (shared tokenizer) ──
export {
  defaultTokenColors,
  registerLanguage,
  profileFor,
} from '@wingleeio/mugen-markdown/native-core';
export type {
  TokenType,
  CodeTokenColors,
  LanguageProfile,
} from '@wingleeio/mugen-markdown/native-core';

// ── Inline pipeline (advanced, shared) ──
export { flattenInline, baseFormat, composeFont } from '@wingleeio/mugen-markdown/native-core';
export type { InlineFormat } from '@wingleeio/mugen-markdown/native-core';

// ── Re-exported native mugen primitives, for one-stop authoring of overrides ──
export { Text, VStack, HStack, Escape, Overlay, definePrimitive } from '@wingleeio/mugen-native';
export type { TextProps, NativeBoxProps, VStackProps, HStackProps } from '@wingleeio/mugen-native';
export type { Font } from '@wingleeio/mugen/native-core';

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
