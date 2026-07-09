import { defineConfig } from 'tsdown';
import { resolve } from 'node:path';

// The native locator (`src/native.ts`) does a LITERAL
// `require('react-native-nitro-modules')` — the only form Metro's dependency
// collector bundles. But web bundlers (Vite/Rolldown/webpack) eagerly resolve
// that literal at build time and fail on React Native's Flow source. So we ship
// TWO builds, selected by package `exports` conditions:
//
//   • DEFAULT (import/require/browser/node) → uses `native.web.ts` (returns
//     null, no react-native reference at all). What Vite/webpack/Node see.
//   • `react-native` (Metro's default condition) → uses the real `native.ts`
//     with the literal require. What React Native sees.
//
// Same source entry (`src/index.ts`), only the native locator differs — swapped
// by a resolve hook for the default build.
const webNativePlugin = {
  name: 'pretext-core-web-native',
  resolveId(source: string) {
    if (source === './native.js' || source === './native') {
      return resolve(import.meta.dirname, 'src/native.web.ts');
    }
    return null;
  },
};

const shared = {
  format: ['esm', 'cjs'] as const,
  // 'neutral' so the lazy `require('react-native-nitro-modules')` stays a bare
  // require() (resolved by Metro at runtime) instead of a `createRequire` from
  // `node:module`, which React Native / Metro can't bundle.
  platform: 'neutral' as const,
  external: ['react', 'react-native', 'react-native-nitro-modules'],
};

export default defineConfig([
  // DEFAULT build — web/node safe: the native locator is stubbed to null, so
  // nothing references react-native-nitro-modules. Emits the canonical dts.
  {
    ...shared,
    entry: { index: 'src/index.ts', 'text-block': 'src/text-block.ts' },
    dts: true,
    clean: true,
    plugins: [webNativePlugin],
  },
  // REACT NATIVE build — the real native locator with the literal require, for
  // Metro via the `react-native` export condition. No dts (shared with default).
  {
    ...shared,
    entry: { 'index.native': 'src/index.ts', 'text-block.native': 'src/text-block.ts' },
    dts: false,
    clean: false,
  },
]);
