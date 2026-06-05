# Deployment

The docs site (`apps/docs`) deploys to **Cloudflare Workers** (with static
assets). It's a TanStack Start app built by Vite + Nitro; the
[`cloudflare_module`](https://nitro.build/deploy/providers/cloudflare) Nitro
preset (configured in `apps/docs/vite.config.ts`) turns `vite build` output into
a deployable Worker and auto-generates the wrangler config.

| Trigger | Workflow | Result |
| --- | --- | --- |
| Push to `main` | `.github/workflows/deploy-production.yml` | Production: `https://mugen-docs.<subdomain>.workers.dev` |
| Open / update a PR | `.github/workflows/deploy-preview.yml` | Per-PR preview: `https://pr-<number>-mugen-docs.<subdomain>.workers.dev` |

`<subdomain>` is your account's `workers.dev` subdomain (chosen in step 1).

## How the build works

`vite build` runs Nitro with `preset: 'cloudflare_module'` and
`cloudflare.deployConfig: true`. That produces:

- `apps/docs/.output/server/` — the Worker (`index.mjs`) + generated
  `wrangler.json` (name `mugen-docs`, `nodejs_compat`, `ASSETS` binding).
- `apps/docs/.output/public/` — prerendered HTML + static assets.
- `apps/docs/.wrangler/deploy/config.json` — a Cloudflare
  [redirected config](https://developers.cloudflare.com/workers/wrangler/configuration#generated-wrangler-configuration)
  pointing wrangler at the generated config. `wrangler deploy` /
  `wrangler versions upload` discover it automatically, so there is **no
  hand-written wrangler file** to maintain.

The Worker name and compatibility date live in `apps/docs/vite.config.ts` under
the `nitro({ cloudflare: { wrangler: … } })` options — change them there, not in
a wrangler file (it's regenerated on every build).

## One-time setup

These steps need a Cloudflare account and GitHub repo admin — do them once.

### 1. Cloudflare account + `workers.dev` subdomain

In the Cloudflare dashboard → **Workers & Pages**, register a `workers.dev`
subdomain if you don't have one. This is **required** for preview URLs — they
can only run on `workers.dev`. Preview URLs are enabled by default once
`workers.dev` is on.

### 2. Create an API token

Dashboard → **My Profile → API Tokens → Create Token** → use the **"Edit
Cloudflare Workers"** template (it grants `Workers Scripts: Edit` +
`Account Settings: Read`). Copy the token.

### 3. Find your Account ID

Dashboard → **Workers & Pages** (or any domain's overview) → copy the
**Account ID**.

### 4. Add the GitHub secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | the token from step 2 |
| `CLOUDFLARE_ACCOUNT_ID` | the ID from step 3 |

### 5. First production deploy

Push to `main` (or run a manual deploy locally — see below). This creates the
`mugen-docs` Worker. After it exists, PR previews work on every pull request.

> Add a remote first if you haven't: `git remote add origin <url>`. The `gh`
> CLI isn't installed here, so create the GitHub repo + push manually (or
> `brew install gh` to script it).

## Local commands

```bash
pnpm --filter docs build                 # produce the Worker in .output/
cd apps/docs
pnpm dlx wrangler@4 dev                   # run the built Worker locally
pnpm dlx wrangler@4 deploy               # manual production deploy
pnpm dlx wrangler@4 versions upload \
  --preview-alias local                  # manual one-off preview
```

`wrangler` reads `apps/docs/.wrangler/deploy/config.json` automatically, so run
it from `apps/docs` after a build. First-time local use needs auth:
`pnpm dlx wrangler@4 login` (or export `CLOUDFLARE_API_TOKEN`).

## Notes & limitations

- **Fork PRs don't get previews.** GitHub doesn't expose secrets to workflows
  from forked repos, so `wrangler` can't authenticate. The preview job is
  skipped for forks (they still deploy to production once merged). For
  same-repo branches it works normally.
- **Custom domain.** To serve production on your own domain instead of
  `workers.dev`, add a route/custom domain to the `mugen-docs` Worker in the
  dashboard (or add `routes` under `cloudflare.wrangler` in `vite.config.ts`).
- **Environment variables / bindings.** Because `deployConfig: true` makes the
  generated config the source of truth, dashboard-set vars are ignored at
  deploy time. Declare any vars/bindings under
  `nitro({ cloudflare: { wrangler: { … } } })` in `apps/docs/vite.config.ts`.
- **Preview cleanup.** Per-PR aliases are reassigned on each push and expire
  with their Worker versions; there's no explicit teardown step.
