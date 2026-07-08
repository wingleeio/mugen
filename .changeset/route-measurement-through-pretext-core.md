---
"@wingleeio/mugen": minor
"@wingleeio/mugen-native": minor
"@wingleeio/mugen-markdown": minor
"@wingleeio/mugen-markdown-native": minor
"@wingleeio/pretext-core": patch
---

Route text measurement through `@wingleeio/pretext-core` (the C++ JSI kernel).

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
