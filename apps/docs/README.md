# docs

The documentation site for the **mugen** package, built with
[Fumadocs](https://fumadocs.dev) on [TanStack Start](https://tanstack.com/start)
(Vite 8).

Content lives in [`content/docs`](./content/docs) as `.mdx` files.

## Develop

```bash
pnpm --filter docs dev      # from the repo root
# or, from this directory:
pnpm dev
```

`dev` runs Vite behind [Portless](https://github.com/vercel-labs/portless), so
the site is served at a named domain that is **unique per git worktree** —
`http://docs.localhost` in the main checkout, `http://<branch>.docs.localhost`
in a worktree. See the [root README](../../README.md#local-domains-portless--one-per-worktree)
for details. Requires a global Portless install (`npm i -g portless`).

No Portless? Use the plain fallback (serves on http://localhost:3000):

```bash
pnpm dev:vite
```

> Dev runs with `DISABLE_NITRO=1` to avoid the unstable Nitro Vite dev worker on
> the current Vite 8 / Nitro 3 beta stack; `build` keeps Nitro. See
> [`vite.config.ts`](./vite.config.ts).

## Build

```bash
pnpm --filter docs build
```

Builds the client, the Nitro `node-server`, and prerenders the docs pages.
