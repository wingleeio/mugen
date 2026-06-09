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
// `vite build` keeps Nitro.
const disableNitro = process.env.DISABLE_NITRO === '1';

// Escape hatch to skip prerendering and ship an SSR-only build (every route
// rendered on demand). Prerendering renders routes in-process, which is fine on
// Vercel — but keep the switch for CI/debugging.
const disablePrerender = process.env.DISABLE_PRERENDER === '1';

export default defineConfig({
  server: {
    // `host: true` binds 0.0.0.0 (all interfaces) instead of the default
    // localhost-only, so the dev server is reachable over LAN / Tailscale.
    host: true,
    port: 3000,
    // Vite only auto-allows `localhost` and IP literals; a request by hostname is
    // rejected with "Blocked request. This host is not allowed." Allow Tailscale
    // MagicDNS names (`<machine>.<tailnet>.ts.net`) so a phone on the tailnet can
    // load the dev server by name, not just by 100.x IP.
    allowedHosts: ['.ts.net'],
  },
  plugins: [
    mdx(),
    tailwindcss(),
    tanstackStart({
      prerender: {
        enabled: !disablePrerender,
      },
    }),
    react(),
    // Production target: Vercel. Nitro's `vercel` preset emits a
    // `.vercel/output` Build Output API directory that Vercel deploys directly —
    // no adapter config, no wrangler. https://nitro.build/deploy/providers/vercel
    ...(disableNitro
      ? []
      : [
          nitro({
            preset: 'vercel',
            compatibilityDate: '2024-11-01',
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
