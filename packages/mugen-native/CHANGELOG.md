# @wingleeio/mugen-native

## 0.4.0

### Minor Changes

- [`983ae81`](https://github.com/wingleeio/mugen/commit/983ae813a57417751a387532f6415b9c4eb350c6) Thanks [@wingleeio](https://github.com/wingleeio)! - mugen now draws its own scroll indicator: a native-driver overlay whose proportion and position come from the engine's exact heights, replacing the platform indicator (which misreads the iOS headroom canvas and visibly resizes as history loads). It shows on user scrolls, tracks every frame on the UI thread with zero JS, and fades on idle; programmatic and streaming scrolls never flash it. `showsVerticalScrollIndicator={false}` hides it. Also: `useMugenVirtualizer({ heightCache })` plugs a persistent height store into the engine, and `CANVAS_HEADROOM` is exported for tests.

### Patch Changes

- Updated dependencies [[`983ae81`](https://github.com/wingleeio/mugen/commit/983ae813a57417751a387532f6415b9c4eb350c6)]:
  - @wingleeio/mugen@0.6.0

## 0.3.0

### Minor Changes

- [`b4aca5a`](https://github.com/wingleeio/mugen/commit/b4aca5a1ab3aaff3fec79d8393e5d2ce84feb5e9) Thanks [@wingleeio](https://github.com/wingleeio)! - Resident mode: `overscan={Infinity}` keeps every row mounted and makes scrolling cost ZERO JavaScript — no row window chases the scroll position, so no fling velocity can outrun it into bare canvas. Exact analytic heights are what make this affordable: rows position absolutely without measurement, and under the iOS origin-canvas scheme an existing row's coordinates are invariant across history prepends, so resident rows never re-render while history loads. This is the mode chat transcripts should use once content is height-cached; windowed mode remains the default. Also adds a `showsVerticalScrollIndicator` passthrough.

## 0.2.3

### Patch Changes

- [`49b94df`](https://github.com/wingleeio/mugen/commit/49b94dfbd24b11b3a648a2126e58d83733201485) Thanks [@wingleeio](https://github.com/wingleeio)! - Flash-proof anchoring and fling-proof windowing. On iOS, rows render into a headroom canvas whose origin moves UP as history prepends, with `contentInset` clamping the scrollable range — a prepend never issues a corrective scroll at all, so there is nothing to race on Fabric (the previous two-commit choreography still had a one-frame hazard between the native scroll landing and the counter-translation clearing; it remains as the Android path). Programmatic jumps beyond the overscan paint BOTH departure and destination windows for one commit. User flings get velocity-aware overscan: the row window leads in the scroll direction by up to 2400px, so a hard fling can no longer outrun the JS round-trip into bare canvas.

## 0.2.2

### Patch Changes

- [`5960e60`](https://github.com/wingleeio/mugen/commit/5960e60a082def519b82976fb11cd2ae25581ccf) Thanks [@wingleeio](https://github.com/wingleeio)! - Programmatic scroll writes re-window rows at JS speed instead of waiting for the native onScroll round-trip, and writes larger than the overscan go through the anchor choreography. Previously the row window trailed the native offset by a frame, so a big instant jump — the stick-to-bottom catching up after a large live append, `scrollToBottom('instant')`, `scrollToItem` — could paint bare canvas for one frame (a visible black flash).

## 0.2.1

### Patch Changes

- [`ed743a7`](https://github.com/wingleeio/mugen/commit/ed743a73f4283bd74c63a562356a515265565de0) Thanks [@wingleeio](https://github.com/wingleeio)! - `MugenVList` resolves `initialScroll` during the first render when the viewport is controlled (`width` + `height`), seeding the row window at the anchor and handing the offset to the ScrollView as its mount-time `contentOffset`. The previous imperative scrollTo raced the native content layout: the viewport could be stranded past the content (blank list, rows at negative y), and the first measure paid for the top-of-list window it was about to jump away from.

- [`49036d2`](https://github.com/wingleeio/mugen/commit/49036d20b117d37d46a899bf8f85004d0e2474d7) Thanks [@wingleeio](https://github.com/wingleeio)! - Flicker-free scroll anchoring on React Native. The web applies anchor shifts post-commit pre-paint; on RN an imperative scrollTo lands a frame late (one-frame flash of the wrong content on every history prepend), and a `contentOffset` prop update is applied by Fabric BEFORE the content grows, so iOS clamps it to the old max and the viewport silently drifts. Anchoring is now a two-commit choreography, each frame pixel-identical: the taller content commits with a counter-translation of the canvas, the corrective scroll dispatches, and its own onScroll drops the translation. Also seeds `initialScroll` through the mount-time `contentOffset` (the one moment Fabric honors it), windowing the first measure at the anchor.

- Updated dependencies [[`bf8b139`](https://github.com/wingleeio/mugen/commit/bf8b1395cbdbfecabfd1de293062ed93829c1c31)]:
  - @wingleeio/pretext-native@0.1.2

## 0.2.0

### Minor Changes

- [`db917ad`](https://github.com/wingleeio/mugen/commit/db917ad49a4a0a2dfef8f520ade5c5d40858fb7c) Thanks [@wingleeio](https://github.com/wingleeio)! - `MugenVList` passes `keyboardDismissMode` and `keyboardShouldPersistTaps` through to its ScrollView. Chat UIs put a composer under the list; without `keyboardDismissMode="interactive"` the keyboard can't be dragged away, and without `keyboardShouldPersistTaps` the first tap on a row only dismisses the keyboard.

### Patch Changes

- [`30b0d87`](https://github.com/wingleeio/mugen/commit/30b0d87e6f96069b396beda212cef1041e6153f4) Thanks [@wingleeio](https://github.com/wingleeio)! - Upgrade `@chenglou/pretext` to 0.0.8. Line breaking no longer splits slash-joined word tokens ("pipeline/features/packages", "and/or") where browsers offer no break opportunity — computed row heights previously undershot the paint by one line whenever such a token straddled a wrap point, overlapping rows in virtualized transcripts. Includes a browser regression test with the real-world failing paragraph across nine widths.

- Updated dependencies [[`aa7f212`](https://github.com/wingleeio/mugen/commit/aa7f212e72f551f1aa1235771c4c3fb5a954bf4e), [`30b0d87`](https://github.com/wingleeio/mugen/commit/30b0d87e6f96069b396beda212cef1041e6153f4)]:
  - @wingleeio/pretext-native@0.1.1
  - @wingleeio/mugen@0.5.1

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

- Updated dependencies [[`69b8e82`](https://github.com/wingleeio/mugen/commit/69b8e82fd5d04bc246a8cf220d80c30b961ca346), [`69b8e82`](https://github.com/wingleeio/mugen/commit/69b8e82fd5d04bc246a8cf220d80c30b961ca346)]:
  - @wingleeio/pretext-native@0.1.0
  - @wingleeio/mugen@0.5.0
