import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/text-block.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  external: ['react', 'react-native', 'react-native-nitro-modules'],
});
