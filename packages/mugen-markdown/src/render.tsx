import { createElement, type ReactNode } from 'react';
import { VStack } from '@wingleeio/mugen';
import type { Image, RootContent } from 'mdast';
import { parseMarkdown, type MarkdownParseOptions } from './parse';
import { resolveTheme, type DeepPartial, type MarkdownTheme } from './theme';
import { baseFormat, composeFont, flattenInline, type InlineFormat } from './inline';
import { RichText, type RichTextRun } from './primitives/rich-text';
import { defaultComponents, mergeComponents } from './components';
import type {
  InlineTextOptions,
  MarkdownComponent,
  MarkdownComponents,
  MarkdownRenderContext,
  ResolvedMarkdownComponents,
} from './types';

export interface RenderMarkdownOptions {
  /** Theme overrides (deep-merged over the defaults). */
  theme?: DeepPartial<MarkdownTheme>;
  /** Block-component overrides. */
  components?: MarkdownComponents;
  /** Parser options (gfm, math, containers). */
  parserOptions?: MarkdownParseOptions;
}

/** The default inner rendering for a node — inline `RichText` or rendered child blocks. */
function renderChildren(node: RootContent, ctx: MarkdownRenderContext): ReactNode {
  const theme = ctx.theme;
  switch (node.type) {
    case 'paragraph':
      return ctx.inlineText(node.children, { lineHeight: theme.lineHeight });
    case 'heading': {
      const d = node.depth;
      return ctx.inlineText(node.children, {
        size: theme.heading.sizes[d],
        weight: theme.heading.weight,
        lineHeight: theme.heading.lineHeights[d],
        ...(theme.heading.color !== 'inherit' ? { color: theme.heading.color } : null),
      });
    }
    case 'blockquote':
      return ctx.renderBlocks(node.children, theme.blockquote.gap);
    default:
      // list / table / code / thematicBreak / image build their own content.
      return null;
  }
}

// Per-block element cache. incremark's incremental parser returns *stable* node
// references for already-completed blocks (only the still-streaming block gets a
// fresh node on each append). Caching the rendered element by node reference
// means a completed block returns the **identical** element across ticks, so
// React bails out of re-rendering it (same element ⇒ same props) and only the
// streaming block re-renders. Invalidated when the resolved theme/components
// change. WeakMap, so nodes from an evicted/reset parser are GC'd.
const blockCache = new WeakMap<
  object,
  { el: ReactNode; theme: MarkdownTheme; components: ResolvedMarkdownComponents; variant: string }
>();

// Secondary, content-keyed cache. The node-reference cache above only catches
// blocks *outside* incremark's re-parsed tail: the still-streaming block is
// re-parsed wholesale each append, so it and all its descendants (e.g. the items
// of a streaming list) get fresh node references even when their content hasn't
// changed. Keying by a structural signature lets those unchanged sub-blocks
// reuse their element too, so only the one block actually being typed rebuilds.
// Computed only on a node-ref miss, so the work is bounded to the streaming tail.
const MAX_CONTENT_CACHE = 4096;
const contentCache = new Map<string, ReactNode>();

// Stable small id per resolved theme/components object, so the content key is
// scoped to them without holding references.
let optIdSeq = 0;
const optId = new WeakMap<object, number>();
function idOf(o: object): number {
  let id = optId.get(o);
  if (id === undefined) {
    id = ++optIdSeq;
    optId.set(o, id);
  }
  return id;
}

/** Structural signature of a node — content + shape, position-independent. */
function blockSig(node: object): string {
  return JSON.stringify(node, (k, v) => (k === 'position' ? undefined : v));
}

/**
 * Memoize an element by its node's content. `variant` distinguishes renderings
 * of the same node that differ by sibling context (a list item's index/marker, a
 * table cell's column). First tries the node-reference cache (completed blocks
 * outside the re-parsed tail), then the content signature (unchanged sub-blocks
 * inside the streaming block), and only then runs `build`.
 */
function memoElement(
  node: object,
  ctx: MarkdownRenderContext,
  variant: string,
  build: () => ReactNode,
): ReactNode {
  const byRef = blockCache.get(node);
  if (
    byRef !== undefined &&
    byRef.theme === ctx.theme &&
    byRef.components === ctx.components &&
    byRef.variant === variant
  ) {
    return byRef.el;
  }
  const sigKey = `${idOf(ctx.theme)}:${idOf(ctx.components)}:${variant}:${blockSig(node)}`;
  const byContent = contentCache.get(sigKey);
  if (byContent !== undefined) {
    contentCache.delete(sigKey); // refresh LRU recency
    contentCache.set(sigKey, byContent);
    blockCache.set(node, { el: byContent, theme: ctx.theme, components: ctx.components, variant });
    return byContent;
  }
  const el = build();
  blockCache.set(node, { el, theme: ctx.theme, components: ctx.components, variant });
  if (contentCache.size >= MAX_CONTENT_CACHE) {
    const oldest = contentCache.keys().next().value;
    if (oldest !== undefined) contentCache.delete(oldest);
  }
  contentCache.set(sigKey, el);
  return el;
}

function memoDispatch(
  node: RootContent,
  ctx: MarkdownRenderContext,
  key?: string | number,
): ReactNode {
  return memoElement(node, ctx, `b:${key}`, () => dispatch(node, ctx, key));
}

function dispatch(node: RootContent, ctx: MarkdownRenderContext, key?: string | number): ReactNode {
  // A paragraph that is just an image renders as a block image.
  if (
    node.type === 'paragraph' &&
    node.children.length === 1 &&
    node.children[0]?.type === 'image'
  ) {
    const image = node.children[0] as Image;
    return createElement(ctx.components.image as MarkdownComponent<Image>, {
      key,
      node: image,
      ctx,
      children: null,
    });
  }

  const components = ctx.components as unknown as Record<
    string,
    MarkdownComponent<RootContent> | undefined
  >;
  const Comp = components[node.type];
  if (Comp == null) {
    // Unsupported / metadata block (definition, footnoteDefinition, yaml, math,
    // raw html when `html` is overridden to null, …) — contributes nothing.
    return null;
  }
  const children = renderChildren(node, ctx);
  return createElement(Comp, { key, node, ctx, children });
}

function createContext(
  theme: MarkdownTheme,
  components: ResolvedMarkdownComponents,
): MarkdownRenderContext {
  const ctx: MarkdownRenderContext = {
    theme,
    components,
    renderBlocks(nodes, gap = theme.blockGap) {
      const kids: ReactNode[] = [];
      for (let i = 0; i < nodes.length; i++) {
        const el = ctx.renderBlock(nodes[i]!, i);
        if (el != null) kids.push(el);
      }
      if (kids.length === 0) return null;
      return createElement(VStack, { gap }, kids);
    },
    renderBlock(node, key) {
      return memoDispatch(node, ctx, key);
    },
    memo(node, variant, build) {
      return memoElement(node, ctx, variant, build);
    },
    renderChildren(node) {
      return renderChildren(node, ctx);
    },
    inlineRuns(nodes, base) {
      const fmt: InlineFormat = { ...baseFormat(theme), ...base };
      const out: RichTextRun[] = [];
      flattenInline(nodes, fmt, theme, out, components.inline);
      return out;
    },
    inlineText(nodes, opts: InlineTextOptions = {}) {
      const fmt = baseFormat(theme, {
        ...(opts.size != null ? { size: opts.size } : null),
        ...(opts.weight != null ? { weight: opts.weight } : null),
        ...(opts.color != null ? { color: opts.color } : null),
      });
      const out: RichTextRun[] = [];
      flattenInline(nodes, fmt, theme, out, components.inline);
      return createElement(RichText, {
        runs: out,
        font: composeFont(fmt),
        lineHeight: opts.lineHeight ?? theme.lineHeight,
        ...(opts.color != null ? { color: opts.color } : null),
        ...(opts.align != null ? { align: opts.align } : null),
      });
    },
  };
  return ctx;
}

/**
 * Parse `source` and render it into a tree of mugen primitives. The result is
 * pure and hook-free, so it can be returned straight from a `<MugenVList>`
 * `render` and measured by the walker. Memoization of parsing/theme/components
 * keeps the measure and render passes cheap.
 */
export function renderMarkdown(source: string, options: RenderMarkdownOptions = {}): ReactNode {
  const ast = parseMarkdown(source, options.parserOptions);
  const theme = resolveTheme(options.theme);
  const components = mergeComponents(options.components);
  const ctx = createContext(theme, components);
  return ctx.renderBlocks(ast.children);
}

export { defaultComponents };
