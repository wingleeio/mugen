import react from '@vitejs/plugin-react';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import mdx from 'fumadocs-mdx/vite';
import { nitro } from 'nitro/vite';

// Nitro builds the production server, but its Vite dev worker is unstable on
// this Vite 8 / Nitro 3 beta stack — interactive `vite dev` throws
// "Vite environment 'ssr' is unavailable". The `dev` scripts set
// DISABLE_NITRO=1 so dev uses TanStack Start's in-process SSR instead, while
// `vite build` (and the prerender preview server it spawns) keeps Nitro.
const disableNitro = process.env.DISABLE_NITRO === '1';

export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [
    mdx(),
    tailwindcss(),
    tanstackStart({
      prerender: {
        enabled: true,
      },
    }),
    react(),
    // Production target: Cloudflare Workers (with static assets). The
    // `cloudflare_module` preset is Cloudflare's recommended modern target.
    // `deployConfig: true` makes Nitro emit `.wrangler/deploy/config.json`
    // (Cloudflare's "redirected" wrangler config that points wrangler at the
    // build output), so `wrangler deploy` / `wrangler versions upload` work
    // with zero hand-written wrangler config. Workers + static assets needs a
    // compatibility date >= 2024-09-19.
    // https://nitro.build/deploy/providers/cloudflare
    ...(disableNitro
      ? []
      : [
          nitro({
            preset: 'cloudflare_module',
            compatibilityDate: '2024-11-01',
            cloudflare: {
              deployConfig: true,
              nodeCompat: true,
              // Merged into the generated `.output/server/wrangler.json`.
              // `name` is the Worker name (production URL becomes
              // `mugen-docs.<subdomain>.workers.dev`); the explicit
              // `compatibility_date` guarantees the >= 2024-09-19 that
              // Workers-with-static-assets requires.
              wrangler: {
                name: 'mugen-docs',
                compatibility_date: '2024-11-01',
              },
            },
          }),
        ]),
  ],
  resolve: {
    tsconfigPaths: true,
    alias: {
      tslib: 'tslib/tslib.es6.js',
    },
  },
});
