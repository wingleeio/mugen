import { defineConfig } from 'tsdown';

// `react`, `@wingleeio/mugen` (peers) and `@incremark/core`, `@chenglou/pretext`
// (deps) are externalized automatically by tsdown — they stay `import`/`require`
// in the output, matching the `@wingleeio/mugen` build (Node >=22 can
// `require()` these ESM-only graphs).
export default defineConfig({
  entry: ['src/index.ts', 'src/native-core.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
});
