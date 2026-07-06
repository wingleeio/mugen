import { createElement, type ReactNode } from 'react';
import { View } from 'react-native';
import type { Font } from '@wingleeio/mugen/native-core';
import type { Image, List, Table } from 'mdast';
import {
  defineMarkdownComponents,
  type MarkdownComponents,
  type MarkdownRenderContext,
  type ResolvedMarkdownComponents,
  type MarkdownTheme,
} from '@wingleeio/mugen-markdown/native-core';
import { VStack, HStack, Overlay } from '@wingleeio/mugen-native';
import { RichText, type RichTextRun } from './primitives/rich-text';
import { CodeBlock } from './primitives/code-block';
import { TableBlock } from './primitives/table-block';
import { resolveColor } from './theme';

function bodyFont(theme: MarkdownTheme): Font {
  return `${theme.fontSize}px ${theme.fontFamily}` as Font;
}

// ── Structural renderers (mirror the web defaults' layout math exactly) ───────

function renderList(node: List, ctx: MarkdownRenderContext): ReactNode {
  const theme = ctx.theme;
  const ordered = node.ordered === true;
  const start = node.start ?? 1;
  const font = bodyFont(theme);
  const markerColor =
    theme.list.markerColor !== 'inherit' ? theme.list.markerColor : undefined;

  const items = node.children.map((item, i) => {
    const markerText =
      item.checked != null ? (item.checked ? '☑' : '☐') : ordered ? `${start + i}.` : '•';
    return ctx.memo(item, `li:${i}:${markerText}`, () => {
      const content = ctx.renderBlocks(item.children, theme.list.gap);
      const markerRun: RichTextRun = { text: markerText, font };
      if (markerColor != null) markerRun.color = markerColor;
      const marker = createElement(RichText, {
        runs: [markerRun],
        font,
        lineHeight: theme.lineHeight,
        color: resolveColor(theme.color, theme),
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
  const rows = node.children.map((row, ri) =>
    row.children.map((cell, ci) =>
      ctx.memo(cell, `td:${ri}:${ci}:${ri === 0 ? 'h' : ''}:${align[ci] ?? ''}`, () =>
        ctx.inlineText(cell.children, {
          lineHeight: theme.lineHeight,
          weight: ri === 0 ? theme.table.headerWeight : undefined,
          align: align[ci] ?? undefined,
        }),
      ),
    ),
  );

  return createElement(TableBlock, {
    rows,
    cellPadding: theme.table.cellPadding,
    divider: theme.table.gap,
    borderColor: theme.table.borderColor,
    headerBackground: theme.table.headerBackground,
    radius: theme.table.radius,
    minColumnWidth: theme.table.minColumnWidth,
  });
}

function renderImage(node: Image, ctx: MarkdownRenderContext): ReactNode {
  const theme = ctx.theme;
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

/**
 * The native default component set — the web defaults' layout math (paddings,
 * gaps, indent, marker text) with native primitives underneath, so a markdown
 * document measures to the same height on both platforms given the same theme.
 * Web-only chrome tricks translate: inset box-shadow rules become overlay
 * Views, `background` becomes `backgroundColor`.
 */
export const defaultNativeComponents: ResolvedMarkdownComponents = {
  paragraph: ({ children }) => children,
  heading: ({ children }) => children,

  blockquote: ({ children, ctx }) => {
    const bq = ctx.theme.blockquote;
    return createElement(
      VStack,
      { padding: bq.padding },
      children,
      // The rule paints as an out-of-flow Overlay stripe — the web uses an
      // inset box-shadow for the same reason: chrome that consumes no width or
      // height the walker didn't count.
      createElement(
        Overlay,
        { key: 'rule' },
        createElement(View, {
          style: {
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 0,
            width: bq.borderWidth,
            backgroundColor: bq.borderColor,
          },
        }),
      ),
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
      highlight: c.highlight,
      ...(c.borderColor != null ? { borderColor: c.borderColor } : null),
      color: resolveColor(c.color, ctx.theme),
      ...(c.header.show
        ? {
            header: {
              height: c.header.height,
              fontSize: c.header.fontSize,
              fontFamily: ctx.theme.monoFamily,
              background: c.header.background,
              color: c.header.color,
              borderColor: c.header.borderColor,
              buttonBackground: c.header.buttonBackground,
            },
          }
        : null),
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
      createElement(VStack, { height: r.thickness, style: { backgroundColor: r.color } }),
    );
  },

  html: () => null,
} as ResolvedMarkdownComponents;

/** Merge user overrides over the native defaults (identity-cached). */
const mergeCache = new WeakMap<object, ResolvedMarkdownComponents>();
export function mergeNativeComponents(
  components?: MarkdownComponents,
): ResolvedMarkdownComponents {
  if (components == null) return defaultNativeComponents;
  const cached = mergeCache.get(components);
  if (cached !== undefined) return cached;
  const merged = { ...defaultNativeComponents, ...components } as ResolvedMarkdownComponents;
  mergeCache.set(components, merged);
  return merged;
}

export { defineMarkdownComponents };
