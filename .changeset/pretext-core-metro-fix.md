---
"@wingleeio/pretext-core": patch
---

Fix React Native / Metro bundling of the `/text-block` entry.

- Build with tsdown `platform: 'neutral'` so the lazy native-module locators
  keep a bare `require` (resolved by Metro at runtime) instead of a
  `createRequire` from `node:module`, which Metro cannot bundle.
- `MugenTextBlock` now statically imports `getHostComponent` from
  `react-native-nitro-modules` (Metro only bundles static imports; a dynamic
  `require` threw "unknown module" at runtime even with the pod installed).
- Declare `react` / `react-native-nitro-modules` as optional peer deps.
