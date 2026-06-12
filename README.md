# mugen

**Virtualized React lists with heights you compute, not measure.**

mugen derives every row's height *arithmetically* — from the text, the font,
and the column width, via
[`@chenglou/pretext`](https://github.com/chenglou/pretext) — and renders the
same description to the DOM. One description feeds both the measurement and the
paint, so they can't disagree by a pixel.

**Docs & live demos: [mugen.winglee.dev](https://mugen.winglee.dev)** — including
a 3,000-message AI chat with streaming markdown, collapsible reasoning traces,
and stick-to-bottom.

```bash
npm i @wingleeio/mugen
```

```tsx
import { MugenVList, Text, VStack, useMugenVirtualizer } from '@wingleeio/mugen';

function Inbox({ messages }: { messages: Message[] }) {
  const list = useMugenVirtualizer({ items: messages });
  return (
    <MugenVList
      instance={list}
      getKey={(m) => m.id}
      font="15px Inter"
      lineHeight={22}
      render={(m) => (
        <VStack gap={2} padding={12}>
          <Text font="600 15px Inter">{m.author}</Text>
          <Text>{m.text}</Text>
        </VStack>
      )}
    />
  );
}
```

## Why

A virtualizer is only as honest as its row heights. DOM-measuring virtualizers
guess, mount, measure, and correct — which means scrollbar jumps, layout shift,
and deep links that land in the wrong place. mugen never measures the DOM:

- **Exact heights up front** — even for rows that have never mounted.
- **Zero layout shift** — no measure-on-mount pass, no second correction.
- **Pixel-exact deep links** — `scrollToItem('41212', { align: 'center' })`
  lands dead-center on the first try.
- **O(log n) everything hot** — a Fenwick offset index patches one row's height
  change and finds the visible slice; a million rows scroll like a thousand.
- **Streaming-native** — incremental markdown
  ([`@wingleeio/mugen-markdown`](packages/mugen-markdown)), smooth
  frame-rate-independent stick-to-bottom, and prepends that never move what
  you're reading.
- **Escape hatch included** — the `Escape` primitive reserves a declared box
  the measurer never looks inside, so shadcn/Radix tooltips, menus, dialogs,
  charts, and images drop straight into rows.

Rows are built from a small measurable vocabulary — `Text`, `VStack`, `HStack`,
`definePrimitive(tag)`, `Escape` — with layout as type-checked props, so a
height can never silently drift from what paints. See
[the fit test](https://mugen.winglee.dev/docs/constraints) for when mugen is
(and isn't) the right tool.

## Packages

| Package | Description |
| --- | --- |
| [`@wingleeio/mugen`](packages/mugen) | The virtualizer: list, primitives, hooks, scrolling. |
| [`@wingleeio/mugen-markdown`](packages/mugen-markdown) | Measurable markdown — incremark-parsed, rendered with mugen primitives, streams incrementally. |

## Development

A [Turborepo](https://turborepo.com) monorepo: `packages/*` are the libraries,
`apps/docs` is the documentation site ([Fumadocs](https://fumadocs.dev) on
[TanStack Start](https://tanstack.com/start), content in
`apps/docs/content/docs`).

Requires Node.js >= 22 and [pnpm](https://pnpm.io) 10+.

```bash
pnpm install
pnpm dev          # everything in watch mode (docs site included)
pnpm build        # build all packages + docs
pnpm test         # run all tests
pnpm check-types  # type-check the workspace
```

Work on a single workspace with a filter, e.g. `pnpm --filter docs dev` or
`pnpm --filter @wingleeio/mugen test`.

`pnpm dev` serves the docs behind
[Portless](https://github.com/vercel-labs/portless) (`npm i -g portless`),
which gives each git worktree its own stable `.localhost` URL
(`http://docs.localhost`, `http://<branch>.docs.localhost`). Without Portless,
use `pnpm --filter docs dev:vite` for plain Vite on `http://localhost:3000`.
The docs dev server runs with `DISABLE_NITRO=1` (Nitro's Vite dev worker is
unstable on the Vite 8 / Nitro 3 beta stack); production builds keep Nitro —
see [DEPLOYMENT.md](DEPLOYMENT.md).

Releases go through [Changesets](https://github.com/changesets/changesets):
pushes to `main` update a "Version Packages" PR, and merging it publishes to
npm.

## License

[MIT](LICENSE) © Wing Lee
