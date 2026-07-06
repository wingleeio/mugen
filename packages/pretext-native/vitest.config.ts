import { defineConfig } from 'vitest/config';

// Plain Node environment on purpose: Node 24 has Intl.Segmenter (to compare
// our fallback against ICU) but no OffscreenCanvas (so the canvas shim path
// is exercised for real by the end-to-end pretext tests).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
