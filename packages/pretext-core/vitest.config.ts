import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Conformance drives the whole corpus through both engines.
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
});
