import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Real-browser accuracy suite runs via vitest.browser.config.ts.
    exclude: ['**/node_modules/**', '**/*.browser.test.{ts,tsx}'],
  },
});
