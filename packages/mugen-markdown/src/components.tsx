import { createElement, type ReactNode } from 'react';
import { VStack, HStack, definePrimitive, type Font } from '@wingleeio/mugen';
import type { Image, List, Table } from 'mdast';
import { RichText, type RichTextRun } from './primitives/rich-text';
import { CodeBlock } from './primitives/code-block';
import type {
  MarkdownComponent,
  MarkdownComponents,
  MarkdownRenderContext,
  ResolvedMarkdownComponents,
} from './types';
import type { MarkdownTheme } from './theme';

/** A `<blockquote>`-backed vertical box, so the default quote is semantic. */
const Blockquote = definePrimitive('blockquote', { name: 'Blockquote' });

function bodyFont(theme: MarkdownTheme): Font {
  return `${theme.fontSize}px ${theme.fontFamily}` as Font;
}

// ── Structural renderers (used by the default components) ─────────────────────

function renderList(node: List, ctx: MarkdownRenderContext): ReactNode {
  const theme = ctx.theme;
  const ordered = node.ordered === true;
  const start = node.start ?? 1;
  const font = bodyFont(theme);
  const markerColor = theme.list.markerColor !== 'inherit' ? theme.list.markerColor : undefined;

  const items = node.children.map((item, i) => {
    const markerText =
      item.checked != null ? (item.checked ? '☑' : '☐') : ordered ? `${start + i}.` : '•';
    // Memoize each item by its content so finished items don't re-render while a
    // later one streams in (`variant` carries the index + marker).
    return ctx.memo(item, `li:${i}:${markerText}`, () => {
      const content = ctx.renderBlocks(item.children, theme.list.gap);
      const markerRun: RichTextRun = { text: markerText, font };
      if (markerColor != null) markerRun.color = markerColor;
      const marker = createElement(RichText, {
        runs: [markerRun],
        font,
        lineHeight: theme.lineHeight,
      });
      return createElement(
        HStack,
        { key: i, align: 'flex-start' },
        createElement(VStack, { width: theme.list.indent }, marker),
        createElement(VStack, {}, content),
      );
    });
  });

  return createElement(VStack, { gap: theme.list.gap }, items);
}

function renderTable(node: Table, ctx: MarkdownRenderContext): ReactNode {
  const theme = ctx.theme;
  const align = node.align ?? [];

  const rows = node.children.map((row, ri) => {
    const isHeader = ri === 0;
    // Memoize each row (and cell) so completed rows don't re-render while a later
    // row streams in.
    return ctx.memo(row, `tr:${ri}`, () => {
      const cells = row.children.map((cell, ci) =>
        ctx.memo(cell, `td:${ri}:${ci}:${isHeader ? 'h' : ''}:${align[ci] ?? ''}`, () => {
          const content = ctx.inlineText(cell.children, {
            lineHeight: theme.lineHeight,
            weight: isHeader ? theme.table.headerWeight : undefined,
            align: align[ci] ?? undefined,
          });
          return createElement(
            VStack,
            {
              key: ci,
              padding: theme.table.cellPadding,
              ...(isHeader ? { style: { background: theme.table.headerBackground } } : null),
            },
            content,
          );
        }),
      );
      return createElement(HStack, { key: ri }, cells);
    });
  });

  return createElement(VStack, { gap: theme.table.gap }, rows);
}

function renderImage(node: Image, ctx: MarkdownRenderContext): ReactNode {
  const theme = ctx.theme;
  // Images have no intrinsic measurable height. The default keeps the row exact
  // by showing the alt text (or a fixed-height placeholder); override `image`
  // for real image layout with known dimensions.
  if (theme.image.placeholderHeight > 0) {
    return createElement(VStack, { height: theme.image.placeholderHeight });
  }
  const font = bodyFont(theme);
  const label = node.alt || node.title || node.url;
  return createElement(RichText, {
    runs: [{ text: `\u{1F5BC} ${label}`, font, color: theme.image.color }],
    font,
    lineHeight: theme.lineHeight,
    color: theme.image.color,
  });
}

// ── The default component set ─────────────────────────────────────────────────

export const defaultComponents: ResolvedMarkdownComponents = {
  // Inline-leaf blocks: `children` is the pre-built `RichText`, so the default
  // simply returns it (and an override can wrap it).
  paragraph: ({ children }) => children,
  heading: ({ children }) => children,

  blockquote: ({ children, ctx }) => {
    const bq = ctx.theme.blockquote;
    return createElement(
      Blockquote,
      {
        padding: bq.padding,
        style: {
          // The rule is painted with an inset shadow, not a border: a border
          // consumes content width the walker doesn't know about, so the quote
          // would wrap earlier in the DOM than in the measure.
          boxShadow: `inset ${bq.borderWidth}px 0 0 ${bq.borderColor}`,
          ...(bq.color !== 'inherit' ? { color: bq.color } : null),
        },
      },
      children,
    );
  },

  code: ({ node, ctx }) => {
    const c = ctx.theme.code;
    const font = `${c.fontSize}px ${ctx.theme.monoFamily}` as Font;
    return createElement(CodeBlock, {
      value: node.value,
      ...(node.lang ? { lang: node.lang } : null),
      font,
      lineHeight: c.lineHeight,
      padding: c.padding,
      background: c.background,
      radius: c.radius,
      ...(c.color !== 'inherit' ? { color: c.color } : null),
    });
  },

  list: ({ node, ctx }) => renderList(node, ctx),

  table: ({ node, ctx }) => renderTable(node, ctx),

  image: ({ node, ctx }) => renderImage(node, ctx),

  thematicBreak: ({ ctx }) => {
    const r = ctx.theme.rule;
    return createElement(
      VStack,
      { padding: r.gap },
      createElement(VStack, { height: r.thickness, style: { background: r.color } }),
    );
  },

  // Raw HTML blocks are not measurable as styled text — dropped by default.
  html: () => null,
};

// Merge user overrides over the defaults once per overrides-object identity.
const mergeCache = new WeakMap<object, ResolvedMarkdownComponents>();

/** Merge a partial component set over the defaults. */
export function mergeComponents(components?: MarkdownComponents): ResolvedMarkdownComponents {
  if (components == null) return defaultComponents;
  const cached = mergeCache.get(components);
  if (cached !== undefined) return cached;
  const merged = { ...defaultComponents, ...components } as ResolvedMarkdownComponents;
  mergeCache.set(components, merged);
  return merged;
}

// Re-export for the dispatcher's typing convenience.
export type { MarkdownComponent };
