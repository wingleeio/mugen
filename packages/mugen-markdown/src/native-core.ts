/**
 * mugen-markdown/native-core — the renderer-agnostic pipeline, for non-DOM
 * ports.
 *
 * Everything here is loadable without react-dom or the DOM: parsing
 * (incremark + streaming caches), the mdast→runs inline pipeline, theming, the
 * dispatcher (`renderMarkdown`, with its `primitives` injection seam), the
 * syntax tokenizer, and the web primitives whose *measure* halves the native
 * package reuses via `getPrimitiveDef` (their render halves emit DOM and are
 * replaced). `@wingleeio/mugen-markdown-native` builds on this entry; the main
 * `.` entry stays the web public API.
 *
 * Semver-exempt plumbing for first-party renderers — app code should import
 * from `@wingleeio/mugen-markdown` (web) or `@wingleeio/mugen-markdown-native`.
 */

// ── Parsing (pure) ──
export { parseMarkdown, clearParseCache } from './parse';
export type { MarkdownParseOptions } from './parse';

// ── Dispatcher (with the primitives injection seam) ──
export { renderMarkdown } from './render';
export type { RenderMarkdownOptions } from './render';
export { defaultComponents, mergeComponents } from './components';

// ── Theme (pure data) ──
export { defaultTheme, resolveTheme } from './theme';
export type { MarkdownTheme, DeepPartial } from './theme';

// ── Types + typed-component helpers ──
export { defineMarkdownComponents } from './types';
export type {
  MarkdownComponents,
  MarkdownComponent,
  MarkdownComponentProps,
  MarkdownRenderContext,
  MarkdownPrimitives,
  ResolvedMarkdownComponents,
  ResolvedMarkdownPrimitives,
  InlineTextOptions,
  InlineComponents,
  InlineComponent,
  InlineRenderContext,
} from './types';

// ── Inline pipeline (pure) ──
export { flattenInline, baseFormat, composeFont } from './inline';
export type { InlineFormat } from './inline';

// ── Web primitives (measure halves reused by the native renderer) ──
export {
  RichText,
  clearRichTextCache,
  measureInline,
  segmentItems,
  prepareCached,
  resolveRunFont,
} from './primitives/rich-text';
export type { RichTextProps, RichTextRun, RichTextSegment } from './primitives/rich-text';
export { CodeBlock } from './primitives/code-block';
export type { CodeBlockProps, CodeBlockHeader } from './primitives/code-block';
export { TableBlock } from './primitives/table-block';
export type { TableBlockProps } from './primitives/table-block';

// ── Syntax highlighting core (pure; the canvas painter stays web-only) ──
export { tokenizeLine, INITIAL_STATE } from './highlight/tokenize';
export type { Token, LineState } from './highlight/tokenize';
export { registerLanguage, profileFor } from './highlight/languages';
export type { LanguageProfile } from './highlight/languages';
export { defaultTokenColors } from './highlight/types';
export type { TokenType, CodeTokenColors } from './highlight/types';
