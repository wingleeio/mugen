# @wingleeio/mugen-markdown

Measurable markdown for [`@wingleeio/mugen`](../mugen). Markdown is parsed with
[incremark](https://www.incremark.com/) into an mdast tree, then rendered with
**mugen primitives** — so mugen's tree walker computes each row's height
analytically, off-screen and never-mounted rows included, with no
measure-on-mount layout shift.

The hard part of markdown in an analytic virtualizer is **inline rich text**: a
sentence like “see `foo()` for **details**” is one wrapping flow of mixed fonts,
which a single-font `<Text>` can't measure. mugen-markdown introduces a
`RichText` primitive that measures mixed-font runs as one flow via
[`@chenglou/pretext`](https://github.com/chenglou/pretext)'s rich-inline layout —
the same layout the browser performs over the rendered spans, so the analytic
height matches the paint exactly (verified by a real-browser accuracy gate).

## Install

```bash
npm i @wingleeio/mugen-markdown @wingleeio/mugen
```

Requires React 18.2 or 19. ESM + CJS, Node ≥22.

## Quick start

```tsx
import { MugenVList, useMugenVirtualizer } from '@wingleeio/mugen';
import { Markdown } from '@wingleeio/mugen-markdown';

function Thread({ messages }: { messages: Message[] }) {
  const list = useMugenVirtualizer({ items: messages });
  return (
    <MugenVList
      instance={list}
      getKey={(m) => m.id}
      maxW="3xl"
      stickToBottom
      render={(m) => <Markdown source={m.body} />}
    />
  );
}
```

`<Markdown>` is a **pure, hook-free** component: it produces the identical
primitive tree in mugen's measure walk and in React's render, so heights can't
desync.

### Streaming

Streaming a growing `source` (LLM output) just works — pass the new string each
tick and every row re-measures to its exact height as it grows. Parsing is
**incremental automatically**: when a `source` extends the one a row parsed last,
mugen-markdown appends only the new text to a retained incremark parser
(`O(delta)`), instead of re-parsing the whole prefix each tick (`O(n²)` over the
stream). Unchanged rows (older messages) are served from a parse cache and never
re-parsed; a non-extending edit falls back to a fresh parse. No API to learn — it
keys off the `source` value, so the same `<Markdown source={text} />` is fast
whether `text` is static or still being written.

## Theming

Everything that affects height — fonts, line heights, paddings, gaps — lives in
the theme as concrete values (the measure walk only sees props, never React
context). Fonts are a **family** plus sizes/weights; inline variants (bold in a
heading, code in a paragraph) are composed automatically. Pass a deep-partial
theme:

```tsx
<Markdown
  source={md}
  theme={{
    fontFamily: 'Inter',
    monoFamily: 'JetBrains Mono',
    fontSize: 15,
    lineHeight: 24,
    link: { color: '#7c3aed' },
    code: { background: '#0b1020', color: '#e5e7eb' },
  }}
/>
```

Families must be measurable — a named web font (`"Inter"`) or a canvas-safe
generic (`"sans-serif"`, `"monospace"`). `"system-ui"` is rejected, because its
canvas metrics drift from what CSS paints.

## Extending: typed components

Override any block-level node with a typed component. The `node` is the matching
mdast node, `children` is what the default would render (so you can wrap it), and
`ctx` exposes recursion + theme helpers. **Build overrides from mugen
primitives** (re-exported here) so they stay measurable:

```tsx
import {
  Markdown,
  defineMarkdownComponents,
  VStack,
  RichText,
} from '@wingleeio/mugen-markdown';

const components = defineMarkdownComponents({
  // `node` is `Heading` — `node.depth` is 1..6.
  heading: ({ node, children, ctx }) =>
    node.depth === 1 ? (
      <VStack gap={4} padding={8} style={{ borderLeft: '3px solid #7c3aed' }}>
        {children}
      </VStack>
    ) : (
      children
    ),

  // `node` is `Code`.
  code: ({ node, ctx }) => <MyHighlightedCode value={node.value} lang={node.lang} ctx={ctx} />,
});

<Markdown source={md} components={components} />;
```

Inline marks (bold, italic, code, links, strikethrough) are styled through the
**theme**, not as components — inline content must collapse into one wrapping
flow to be measured exactly. For full inline control, override the block
component (e.g. `paragraph`) and build runs with `ctx.inlineRuns(...)`.

### What's overridable

`paragraph`, `heading`, `thematicBreak`, `blockquote`, `list`, `code`, `table`,
`image`, `html`. GFM (tables, task lists, strikethrough, autolinks) is on by
default. Images have no intrinsic measurable height — the default renders the alt
text; override `image` for real images with known dimensions.

## Primitives

- **`RichText`** — mixed-font inline that wraps as one flow; height is
  `lines × lineHeight` from pretext's rich-inline layout.
- **`CodeBlock`** — non-wrapping code; height is `lines × lineHeight + padding`.

Both are built with mugen's `markPrimitive`, the same way you'd build your own.

## Develop

```bash
pnpm --filter @wingleeio/mugen-markdown test          # node tests (happy-dom, pretext mocked)
pnpm --filter @wingleeio/mugen-markdown test:browser  # real-browser accuracy gate (Playwright/Chromium)
pnpm --filter @wingleeio/mugen-markdown check-types
pnpm --filter @wingleeio/mugen-markdown build         # ESM + CJS + d.ts via tsdown
```
