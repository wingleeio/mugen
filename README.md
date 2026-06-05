# mugen

A [Turborepo](https://turborepo.com) monorepo for the **mugen** package and its documentation.

## Structure

```
.
├── apps/
│   └── docs/        # Documentation site — Fumadocs on TanStack Start (Vite 8)
└── packages/
    └── mugen/       # The mugen package (work in progress)
```

## Requirements

- Node.js >= 22
- [pnpm](https://pnpm.io) 10+
- [Portless](https://github.com/vercel-labs/portless) (global) for named local
  domains: `npm i -g portless`

## Getting started

```bash
pnpm install
```

## Scripts

Run from the repo root (Turborepo orchestrates the workspaces):

| Command             | Description                                  |
| ------------------- | -------------------------------------------- |
| `pnpm dev`          | Run every package in dev/watch mode          |
| `pnpm build`        | Build all packages and the docs site         |
| `pnpm check-types`  | Type-check the whole workspace               |
| `pnpm clean`        | Remove build artifacts                       |

To work on a single workspace, use a filter, e.g.:

```bash
pnpm --filter docs dev      # docs site only
pnpm --filter mugen build   # the mugen package only
```

## Local domains (Portless) — one per worktree

`pnpm dev` runs the docs site behind [Portless](https://github.com/vercel-labs/portless),
which gives each dev server a stable, named `.localhost` URL instead of a port
number — and **automatically gives every git worktree its own subdomain**.

| Where you run it                         | URL                              |
| ---------------------------------------- | -------------------------------- |
| Main checkout                            | `http://docs.localhost`          |
| A worktree on branch `feature/login`     | `http://login.docs.localhost`    |
| A worktree on branch `t3code/3202727a`   | `http://3202727a.docs.localhost` |

The subdomain is derived from the **last segment of the branch name** (Portless
handles this automatically — no config or `--force` needed, so two worktrees
never collide on a port). The proxy auto-starts on first use; the first run may
prompt for `sudo` to bind port 443 and to trust a local CA.

Useful commands:

```bash
portless list                # show active routes/URLs
portless get docs            # print the docs URL (for scripts/cross-refs)
```

The docs `dev` script wraps Vite as `portless run vite dev`, so Portless infers
the name (`docs`) from its `package.json` and applies the worktree prefix. If
you don't have Portless installed, use the plain fallback:

```bash
pnpm --filter docs dev:vite  # plain Vite on http://localhost:3000
```

> **Note** — the docs dev server runs with `DISABLE_NITRO=1`. Nitro's Vite dev
> worker is unstable on the current Vite 8 / Nitro 3 beta stack (it throws
> `Vite environment 'ssr' is unavailable`), so dev uses TanStack Start's
> in-process SSR. `pnpm build` keeps Nitro for the production server. See
> `apps/docs/vite.config.ts`.

## Packages

### `mugen`

The library this repo is built around. It is currently an empty scaffold — the
public API and the docs in `apps/docs` will grow together over time.

### `docs`

The documentation site for `mugen`, built with [Fumadocs](https://fumadocs.dev)
on [TanStack Start](https://tanstack.com/start). Content lives in
`apps/docs/content/docs`.
