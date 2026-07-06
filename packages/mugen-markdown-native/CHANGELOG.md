# @wingleeio/mugen-markdown-native

## 0.2.0

### Minor Changes

- [`b15061a`](https://github.com/wingleeio/mugen/commit/b15061a379959bf38dfc3e3004d11d8295b632d2) Thanks [@wingleeio](https://github.com/wingleeio)! - One native Text node per BLOCK, not per wrapped line. The native `Text` and `RichText` primitives materialized pretext's line breaks as one absolutely-positioned `<Text>` **per line** — so a 10-line paragraph was ~10 Fabric nodes versus the web's single node. Mounting a screenful of markdown was ~10× the view-creation cost of the web, which is what a fast fling outran into blank canvas. Now each block joins its lines at pretext's break points with hard `\n` into a single `<Text>` capped at the measured line count (`numberOfLines`), so height stays exact (a sub-pixel shaper disagreement clips instead of reflowing) and per-row mount cost matches the web. `RichText` collapses only runs of consecutive single-fragment, same-style lines (plain paragraphs — the common case); lines with inline marks, links, or an active streaming fade keep their per-fragment nodes.

## 0.1.3

### Patch Changes

- [`983ae81`](https://github.com/wingleeio/mugen/commit/983ae813a57417751a387532f6415b9c4eb350c6) Thanks [@wingleeio](https://github.com/wingleeio)! - `@wingleeio/mugen-native` moved from dependencies to peerDependencies (>=0.2.0). As a regular dependency, a consumer upgrading mugen-native past the pinned range got a SECOND nested copy — and module state (the font registry) split between them, silently rendering markdown text blank. A peer guarantees exactly one copy in the app graph.

- Updated dependencies [[`983ae81`](https://github.com/wingleeio/mugen/commit/983ae813a57417751a387532f6415b9c4eb350c6)]:
  - @wingleeio/mugen@0.6.0

## 0.1.2

### Patch Changes

- Updated dependencies [[`b4aca5a`](https://github.com/wingleeio/mugen/commit/b4aca5a1ab3aaff3fec79d8393e5d2ce84feb5e9)]:
  - @wingleeio/mugen-native@0.3.0

## 0.1.1

### Patch Changes

- [`30b0d87`](https://github.com/wingleeio/mugen/commit/30b0d87e6f96069b396beda212cef1041e6153f4) Thanks [@wingleeio](https://github.com/wingleeio)! - Upgrade `@chenglou/pretext` to 0.0.8. Line breaking no longer splits slash-joined word tokens ("pipeline/features/packages", "and/or") where browsers offer no break opportunity — computed row heights previously undershot the paint by one line whenever such a token straddled a wrap point, overlapping rows in virtualized transcripts. Includes a browser regression test with the real-world failing paragraph across nine widths.

- Updated dependencies [[`30b0d87`](https://github.com/wingleeio/mugen/commit/30b0d87e6f96069b396beda212cef1041e6153f4), [`db917ad`](https://github.com/wingleeio/mugen/commit/db917ad49a4a0a2dfef8f520ade5c5d40858fb7c)]:
  - @wingleeio/mugen@0.5.1
  - @wingleeio/mugen-markdown@0.5.1
  - @wingleeio/mugen-native@0.2.0

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

### Patch Changes

- Updated dependencies [[`69b8e82`](https://github.com/wingleeio/mugen/commit/69b8e82fd5d04bc246a8cf220d80c30b961ca346), [`69b8e82`](https://github.com/wingleeio/mugen/commit/69b8e82fd5d04bc246a8cf220d80c30b961ca346), [`69b8e82`](https://github.com/wingleeio/mugen/commit/69b8e82fd5d04bc246a8cf220d80c30b961ca346)]:
  - @wingleeio/mugen-markdown@0.5.0
  - @wingleeio/mugen-native@0.1.0
  - @wingleeio/mugen@0.5.0
