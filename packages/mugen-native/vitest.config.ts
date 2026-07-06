import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Tests run in plain Node (no DOM — the whole point of the port) with
// `react-native` aliased to a minimal host-component stub. Windowing, scrolling
// and measurement are exercised by invoking `onLayout`/`onScroll` props
// directly; text metrics come from @wingleeio/pretext-native's hermetic test
// font, so heights are deterministic without a device.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      'react-native': fileURLToPath(new URL('./test/react-native-stub.tsx', import.meta.url)),
    },
  },
});
