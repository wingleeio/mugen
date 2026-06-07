import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// Real-browser suite: validates that analytic (pretext) heights for rendered
// markdown match the DOM — the same accuracy gate `@wingleeio/mugen` uses.
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
