import { defineConfig } from 'tsdown';

// `react`, `react-dom`, and `@wingleeio/mugen` are peers — tsdown externalizes
// them automatically, matching the `@wingleeio/mugen` build.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
});
