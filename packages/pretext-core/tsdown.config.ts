import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/text-block.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  external: ['react', 'react-native', 'react-native-nitro-modules'],
  // 'neutral' so the lazy `require('react-native-nitro-modules')` in the native
  // locators stays a bare require() (resolved by Metro at runtime) instead of a
  // `createRequire` from `node:module` — which React Native / Metro can't
  // bundle. This package is only ever consumed by a React-Native bundler, where
  // `require` is provided.
  platform: 'neutral',
});
