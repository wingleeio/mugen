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
      return dispatch(node, ctx, key);
    },
    renderChildren(node) {
      return renderChildren(node, ctx);
    },
    inlineRuns(nodes, base) {
      const fmt: InlineFormat = { ...baseFormat(theme), ...base };
      const out: RichTextRun[] = [];
      flattenInline(nodes, fmt, theme, out);
      return out;
    },
    inlineText(nodes, opts: InlineTextOptions = {}) {
      const fmt = baseFormat(theme, {
        ...(opts.size != null ? { size: opts.size } : null),
        ...(opts.weight != null ? { weight: opts.weight } : null),
        ...(opts.color != null ? { color: opts.color } : null),
      });
      const out: RichTextRun[] = [];
      flattenInline(nodes, fmt, theme, out);
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
