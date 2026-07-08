# @wingleeio/pretext-core

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
