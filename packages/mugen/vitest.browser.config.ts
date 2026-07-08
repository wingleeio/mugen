import { fileURLToPath } from 'node:url';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// Real-browser suite: validates that analytic (pretext) heights match the DOM.
export default defineConfig({
  // pretext-core's native locator does a literal `require('react-native-nitro-
  // modules')` (needed so Metro bundles it on RN); the web bundler follows that
  // literal and chokes on the package's React-Native Flow source. The browser
  // path never uses the native module — getNative() falls back to JS — so alias
  // it to an empty stub here.
  resolve: {
    alias: {
      'react-native-nitro-modules': fileURLToPath(
        new URL('./vitest.nitro-stub.ts', import.meta.url),
      ),
    },
  },
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
