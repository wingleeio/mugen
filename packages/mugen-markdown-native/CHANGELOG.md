# @wingleeio/mugen-markdown-native

## 0.4.1

### Patch Changes

- [#55](https://github.com/wingleeio/mugen/pull/55) [`519710b`](https://github.com/wingleeio/mugen/commit/519710be92f9daed296ca341eca03812aaafc14f) Thanks [@wingleeio](https://github.com/wingleeio)! - `<MugenTextBlock>` is now injected by the consumer instead of dynamically
  required. `setMugenTextBlock(component)` (replacing `setMugenTextBlockEnabled`)
  takes the `@wingleeio/pretext-core/text-block` component directly, so this
  package has no runtime dependency on pretext-core and never emits a
  `require('@wingleeio/pretext-core/text-block')` — which pulled a `node:module`
  `createRequire` shim into the ESM build that React Native / Metro can't bundle.

## 0.4.0

### Minor Changes

- [#51](https://github.com/wingleeio/mugen/pull/51) [`6737a27`](https://github.com/wingleeio/mugen/commit/6737a27cb341077bc95cc238b0fd09c5e29d73ce) Thanks [@wingleeio](https://github.com/wingleeio)! - Opt-in `<MugenTextBlock>` single-native-view rendering path for `RichText`.

  `setMugenTextBlockEnabled(true)` (default off) makes a whole markdown block
  render as **one** native view (`@wingleeio/pretext-core`'s `MugenTextBlock`)
  instead of a per-fragment `<Text>` tree — a row drops from 10–30 fibers to 1–2.
  The block is built from the same pretext rich-inline walk the measure pass uses,
  so painted geometry equals the measured geometry (`lines × lineHeight`); inline
  boxes overlay at their reserved advances. Off by default (and a no-op unless
  `@wingleeio/pretext-core`'s native view is installed), so existing behavior is
  unchanged until the on-device measurements in NATIVE-TEXT.md hold.

### Patch Changes

- Updated dependencies [[`6737a27`](https://github.com/wingleeio/mugen/commit/6737a27cb341077bc95cc238b0fd09c5e29d73ce)]:
  - @wingleeio/mugen@0.7.0

## 0.3.2

### Patch Changes

- [`233053f`](https://github.com/wingleeio/mugen/commit/233053fe2a4f02f477dbc389d6346b4db52cf9a8) Thanks [@wingleeio](https://github.com/wingleeio)! - Cleaner default table design — a frameless "flat hairline" look. Tables now drop the outer border/box, the header background fill, and the rounded corners, keeping only faint horizontal rules under the header and between rows. Padding is a touch airier and the header is bolder. Web and native match.

  New `theme.table` defaults: `headerBackground: 'transparent'`, `radius: 0`, `borderColor: 'rgba(127,127,127,0.2)'`, `cellPadding: 12`, `headerWeight: 700`. Override any of them to bring back a framed/filled table (e.g. `radius: 8` + a `borderColor` still clips rounded corners; the row rules remain the hairline separators).

- Updated dependencies [[`233053f`](https://github.com/wingleeio/mugen/commit/233053fe2a4f02f477dbc389d6346b4db52cf9a8)]:
  - @wingleeio/mugen-markdown@0.6.2

## 0.3.1

### Patch Changes

- [`591280e`](https://github.com/wingleeio/mugen/commit/591280e163e2653266f7371a78666b6dbfbbf2d3) Thanks [@wingleeio](https://github.com/wingleeio)! - Code now renders literal characters instead of programming ligatures. A monospace font's `===`, `!=`, `>=`, `=>`, `->` etc. were being drawn as combined ligature glyphs in code blocks and inline code, which is misleading when reading code.

  Fenced code and inline `code` now disable ligatures across every paint path — the web `<pre>`/`<code>` and inline spans (`font-variant-ligatures: none`), the canvas syntax-highlight overlay (`textRendering: optimizeSpeed`), and React Native `Text` (`fontVariant: no-common-ligatures/no-contextual/…`). Body prose keeps its ligatures. This is height-neutral: monospace advances don't change under ligature substitution, so measured heights are unaffected.

- Updated dependencies [[`591280e`](https://github.com/wingleeio/mugen/commit/591280e163e2653266f7371a78666b6dbfbbf2d3)]:
  - @wingleeio/mugen-markdown@0.6.1

## 0.3.0

### Minor Changes

- [`808d52d`](https://github.com/wingleeio/mugen/commit/808d52d896db4dcc49c5a8f124902485548d638d) Thanks [@wingleeio](https://github.com/wingleeio)! - Markdown tables now keep a reasonable minimum column width and scroll horizontally instead of crushing columns into per-character wrapping on narrow viewports (web and React Native).

  Each column gets a max-content width and a floor of `min(max-content, theme.table.minColumnWidth)` (default `96`). Widths resolve exactly the way CSS flexbox resolves `flex-grow: max-content; flex-basis: 0` cells with a `min-width` floor: wide viewports fill proportionally as before, and once the columns' minimums no longer fit the row the table overflows into a clipped, horizontally-scrolling viewport (scrollbar hidden on web, `ScrollView` on native) whose measured height still equals what it paints. Tune the floor via `theme.table.minColumnWidth`.

### Patch Changes

- Updated dependencies [[`808d52d`](https://github.com/wingleeio/mugen/commit/808d52d896db4dcc49c5a8f124902485548d638d)]:
  - @wingleeio/mugen-markdown@0.6.0

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
