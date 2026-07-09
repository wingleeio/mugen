# @wingleeio/pretext-core

## 0.1.4

### Patch Changes

- [#59](https://github.com/wingleeio/mugen/pull/59) [`44b6996`](https://github.com/wingleeio/mugen/commit/44b6996c28a925a888964a75a9a7eb3ed284cd43) Thanks [@wingleeio](https://github.com/wingleeio)! - Fix the native C++ JSI engine never actually engaging on React Native (it
  silently fell back to the JS engine). Four issues, all in how the native module
  is located and compiled:

  - **`this`-binding**: `native.ts` called `createHybridObject` as a detached
    reference; Nitro's proxy throws "`this` is not bound". Call it as a method on
    `NitroModules`.
  - **Premature memoization**: `getNative()` ran once at module load — before
    Nitro registers `PretextCore` — and cached the resulting `null` forever.
    Now it memoizes only success and retries until the registry is ready.
  - **Metro can't bundle the shimmed require**: `platform: 'neutral'` rewrites
    `require` to a `__require` shim that Metro's dependency collector ignores, so
    `react-native-nitro-modules` was never bundled ("unknown module"). A
    post-build step restores the literal `require("react-native-nitro-modules")`.
  - **C++ namespace collision**: the Nitro HybridObject impls live in
    `margelo::nitro::pretextcore` and referenced the global helper namespace as
    `pretextcore::…`, which the compiler bound to the enclosing namespace and
    failed to compile on a clean build. Renamed the helper namespace to `ptcjsi`.

  With these, `getNative()` resolves the C++ HybridObject and text measurement
  runs in native (verified on device: cold session opens dropped to ~100 ms).

- [#61](https://github.com/wingleeio/mugen/pull/61) [`6a38e6a`](https://github.com/wingleeio/mugen/commit/6a38e6a0351f5d801fc2eb1e34cf0893f94fb560) Thanks [@wingleeio](https://github.com/wingleeio)! - Fix web/electron builds that consume pretext-core (directly or via mugen). The
  native locator does a literal `require("react-native-nitro-modules")` — the only
  form Metro bundles — but web bundlers (Vite/Rolldown/webpack) eagerly resolve
  that literal at build time and fail on React Native's Flow source ("Flow is not
  supported"). The runtime try/catch only saved Node, not a web _build_.

  pretext-core now ships two builds selected by `exports` conditions: the
  `react-native` condition keeps the literal require (Metro/on-device), while the
  default `import`/`require` entry uses a locator that always returns null and
  references no native module at all — so web/electron/Node bundles stay clean and
  fall back to the pure-JS engine, exactly as before native measurement existed.

## 0.1.3

### Patch Changes

- [#59](https://github.com/wingleeio/mugen/pull/59) [`d5bc945`](https://github.com/wingleeio/mugen/commit/d5bc94543dfc604965c935857ee4c846c2309e79) Thanks [@wingleeio](https://github.com/wingleeio)! - Fix the native C++ JSI engine never actually engaging on React Native (it
  silently fell back to the JS engine). Four issues, all in how the native module
  is located and compiled:

  - **`this`-binding**: `native.ts` called `createHybridObject` as a detached
    reference; Nitro's proxy throws "`this` is not bound". Call it as a method on
    `NitroModules`.
  - **Premature memoization**: `getNative()` ran once at module load — before
    Nitro registers `PretextCore` — and cached the resulting `null` forever.
    Now it memoizes only success and retries until the registry is ready.
  - **Metro can't bundle the shimmed require**: `platform: 'neutral'` rewrites
    `require` to a `__require` shim that Metro's dependency collector ignores, so
    `react-native-nitro-modules` was never bundled ("unknown module"). A
    post-build step restores the literal `require("react-native-nitro-modules")`.
  - **C++ namespace collision**: the Nitro HybridObject impls live in
    `margelo::nitro::pretextcore` and referenced the global helper namespace as
    `pretextcore::…`, which the compiler bound to the enclosing namespace and
    failed to compile on a clean build. Renamed the helper namespace to `ptcjsi`.

  With these, `getNative()` resolves the C++ HybridObject and text measurement
  runs in native (verified on device: cold session opens dropped to ~100 ms).

## 0.1.2

### Patch Changes

- [#57](https://github.com/wingleeio/mugen/pull/57) [`9a5fd30`](https://github.com/wingleeio/mugen/commit/9a5fd3024d0945cb5d12e09df6d64486b3272b67) Thanks [@wingleeio](https://github.com/wingleeio)! - Route text measurement through `@wingleeio/pretext-core` (the C++ JSI kernel).

  mugen's measure seam (`measure.ts`), the native `Text` layout, and the
  rich-inline paths now import from `@wingleeio/pretext-core` instead of
  `@chenglou/pretext` directly. On React Native (with the `PretextCore` JSI
  module installed) segmentation + advance measurement run in native C++ —
  ~2 ms/text-node → tens of µs; on web/Node it falls back to `@chenglou/pretext`
  byte-for-byte (real canvas on desktop). `configureMugenNative` registers fonts
  through the same seam so the C++ kernel has the glyph advances it measures with.

  pretext-core now declares `@chenglou/pretext` and `@wingleeio/pretext-native`
  as runtime dependencies (they were dev-only), so the JS fallback resolves in a
  clean consumer install.

## 0.1.1

### Patch Changes

- [#55](https://github.com/wingleeio/mugen/pull/55) [`519710b`](https://github.com/wingleeio/mugen/commit/519710be92f9daed296ca341eca03812aaafc14f) Thanks [@wingleeio](https://github.com/wingleeio)! - Fix React Native / Metro bundling of the `/text-block` entry.

  - Build with tsdown `platform: 'neutral'` so the lazy native-module locators
    keep a bare `require` (resolved by Metro at runtime) instead of a
    `createRequire` from `node:module`, which Metro cannot bundle.
  - `MugenTextBlock` now statically imports `getHostComponent` from
    `react-native-nitro-modules` (Metro only bundles static imports; a dynamic
    `require` threw "unknown module" at runtime even with the pod installed).
  - Declare `react` / `react-native-nitro-modules` as optional peer deps.

## 0.1.0

### Minor Changes

- [#51](https://github.com/wingleeio/mugen/pull/51) [`6737a27`](https://github.com/wingleeio/mugen/commit/6737a27cb341077bc95cc238b0fd09c5e29d73ce) Thanks [@wingleeio](https://github.com/wingleeio)! - New package: the pretext text engine as a C++ JSI module for React Native.

  Ports `@chenglou/pretext` (line breaker + layout) and `@wingleeio/pretext-native`
  (font-table advance metrics) to native C++, exposed as synchronous JSI calls via
  Nitro Modules — one codebase for iOS and Android. Text segmentation and advance
  measurement drop from ~2 ms/node in JS to tens of microseconds in C++, so a whole
  account can be measured on demand instead of hydrated from a persistent cache.

  A single import (`@wingleeio/pretext-core`) mirrors the `@chenglou/pretext`
  (+ `/rich-inline`) function surface and `pretext-native`'s font registration API,
  dispatching to the native HybridObject when installed and to the pure-JS engine
  (byte-identical) on web and in tests. A golden conformance harness runs both
  engines over the full 18-language corpus, rich-inline, and every layout API,
  requiring byte-identical output (`Object.is` per number); it runs in CI.
