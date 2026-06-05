import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// Real-browser suite: validates that analytic (pretext) heights match the DOM.
export default defineConfig({
  test: {
    include: ['src/**/*.browser.test.{ts,tsx}'],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: 'chromium' }],
    },
  },
});
