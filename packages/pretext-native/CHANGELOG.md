# @wingleeio/pretext-native

## 0.1.0

### Minor Changes

- [`69b8e82`](https://github.com/wingleeio/mugen/commit/69b8e82fd5d04bc246a8cf220d80c30b961ca346) Thanks [@wingleeio](https://github.com/wingleeio)! - Initial release — mugen on React Native.

  - `@wingleeio/pretext-native` runs `@chenglou/pretext` on Hermes: a pure-JS
    font-table ruler (cmap/hmtx/kern/GPOS pair kerning, read from the app's own
    TTF/OTF files) behind an `OffscreenCanvas` shim, plus an `Intl.Segmenter`
    fallback. pretext itself runs unmodified.
  - `@wingleeio/mugen-native` is the React Native renderer for the shared mugen
    engine: `MugenVList` on a `ScrollView` (windowing, scroll anchoring,
    stick-to-bottom spring, initial scroll, reach callbacks — all the web code),
    with `Text` painting pretext's materialized lines so RN's line breaker can
    never desync paint from the measured height. `VStack`/`HStack`/`Escape`/
    `Collapse`/`Overlay` primitives share their measure halves with the web.
  - `@wingleeio/mugen-markdown-native` is measurable markdown for React Native:
    the web pipeline (incremark parsing, theme, inline runs, block memoization,
    syntax tokenizer) with native `RichText` (per-fragment pretext geometry),
    `CodeBlock` (tokenizer-colored lines), `TableBlock` (shared column ratios),
    and a streaming `FadeMarkdown`.
