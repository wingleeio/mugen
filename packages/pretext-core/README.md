# @wingleeio/pretext-core

The pretext text engine as a **C++ JSI module** for React Native. It ports
[`@chenglou/pretext`](https://github.com/chenglou/pretext) (the line breaker and
layout kernel) and [`@wingleeio/pretext-native`](../pretext-native) (font-table
advance metrics) to native C++, exposed as **synchronous** JSI calls via
[Nitro Modules](https://nitro.margelo.com). One codebase drives iOS and Android.

Why: on Hermes the JS engine spent ~2 ms per text node segmenting and measuring
advances. In C++ that drops to tens of microseconds — measuring a whole 8,000
-block account becomes cheaper than hydrating a height cache. This is what lets
mugen delete its persistent height/paint caches, the boot warmer, and the
wormhole scroll on device. See `mugen/NATIVE-TEXT.md`.

## Single import, two backends

`import … from '@wingleeio/pretext-core'` exposes the **exact**
`@chenglou/pretext` (+ `/rich-inline`) function surface plus `pretext-native`'s
font registration API. It dispatches to:

- **native** — the `PretextCore` Nitro HybridObject (C++ kernel), when installed;
- **JS fallback** — `@chenglou/pretext` + `@wingleeio/pretext-native`, byte-for
  -byte identical, on web and in tests.

So mugen's measure code keeps its call sites; only the import changes.

## Conformance is the contract

The C++ kernel must produce **byte-identical** output to the TS engine running on
`pretext-native`'s polyfills (exactly what ships on Hermes today). `pnpm test`
builds a host CLI (`tools/fixture-runner`) and drives both engines over the same
ops — the full 18-language corpus, rich-inline, and every layout API — comparing
each number with `Object.is` and each string with `===`. This runs in CI
(`pretext-core-conformance`). See [`PORTING.md`](./PORTING.md) for the porting
rules that make this hold (UTF-16 everywhere, doubles not floats, `-ffp-contract
=off`, the neutral engine profile, a hermetic segmenter instead of ICU).

## Layout

- `cpp/pretext/**` — the platform-independent kernel (segmenter, sfnt parser,
  analysis, line-break, layout, rich-inline, bidi) + generated Unicode tables.
- `cpp/{PretextCoreModule,PreparedTextObject,PreparedRichInlineObject}.cpp` —
  Nitro HybridObject implementations wrapping the kernel.
- `src/` — the JS wrapper (`index.ts`) + native locator (`native.ts`).
- `nitrogen/generated/` — Nitro codegen output (regenerate with `npx nitrogen`).
- `scripts/gen-unicode-tables.mjs`, `scripts/gen-bidi-data.mjs` — table
  generators (run on Node so the Unicode data matches the TS `\p{…}` regexes).

## Build

- JS: `pnpm build` (tsdown → `dist/`).
- Host kernel + conformance CLI: `pnpm build:host` (CMake; needs `cmake`).
- iOS/Android: consumed as a Nitro module — `pod install` / gradle sync in the
  host app picks up `PretextCore.podspec` / `android/build.gradle`.
