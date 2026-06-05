import { defineConfig } from 'vitest/config';

// Vitest 4 transforms TS/TSX with oxc, which reads `jsx: "react-jsx"` from
// tsconfig.json — no explicit JSX config needed here.
export default defineConfig({
  test: {
    environment: 'happy-dom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Real-browser accuracy suite runs via vitest.browser.config.ts.
    exclude: ['**/node_modules/**', '**/*.browser.test.{ts,tsx}'],
  },
});
