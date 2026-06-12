# Deployment

The docs site (`apps/docs`) deploys to **Vercel** and serves at
**https://mugen.winglee.dev**. It's a TanStack Start app built by Vite + Nitro;
the [`vercel`](https://nitro.build/deploy/providers/vercel) Nitro preset
(configured in `apps/docs/vite.config.ts`) turns `vite build` output into a
[Build Output API](https://vercel.com/docs/build-output-api) directory that
Vercel deploys directly — no adapter config to maintain.

| Trigger            | Result                                |
| ------------------ | ------------------------------------- |
| Push to `main`     | Production: https://mugen.winglee.dev |
| Open / update a PR | Per-PR preview URL on Vercel          |

Both come from Vercel's Git integration — there is no deploy workflow in
`.github/workflows` (CI there runs checks and the Changesets release only).

## How the build works

`vite build` runs Nitro with `preset: 'vercel'` and produces
`apps/docs/.vercel/output/`: prerendered static pages plus a serverless
function for anything dynamic.

Vercel project settings:

- **Root directory:** `apps/docs`
- **Build command:** `cd ../.. && pnpm turbo run build --filter=docs`
- **Output directory:** detected automatically from `.vercel/output`

## Environment switches

- `DISABLE_NITRO=1` — dev only: `vite dev` uses TanStack Start's in-process
  SSR instead of Nitro's dev worker (unstable on the current Vite 8 / Nitro 3
  beta stack). Production builds keep Nitro.
- `DISABLE_PRERENDER=1` — escape hatch to skip prerendering and ship an
  SSR-only build (every route rendered on demand).

## npm releases

Package publishing is separate from the docs deploy: pushes to `main` make the
Changesets workflow (`.github/workflows/release.yml`) open or update a
"Version Packages" PR; merging that PR publishes `@wingleeio/mugen` and
`@wingleeio/mugen-markdown` to npm.
