import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/native-core.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
});
