# pretext-native

Runs [`@chenglou/pretext`](https://github.com/chenglou/pretext) — analytic
multiline text measurement — on **React Native / Hermes**, where there is no
canvas, no DOM, and no `Intl.Segmenter`.

pretext's layout math is pure arithmetic; its only platform needs are a
`measureText` ruler and a text segmenter. This package supplies both:

- **A pure-JS font-table ruler.** Glyph advances are read straight out of your
  bundled TTF/OTF files (`cmap`, `hmtx`, `kern`, GPOS pair kerning) — the same
  files the platform paints with, so measurement and paint share one source of
  truth. No native modules, no WASM, no woff2.
- **An `Intl.Segmenter` fallback** (UAX #29-lite grapheme clusters + word
  segmentation) for engines that lack it. The real `Intl.Segmenter` is used
  when present.

Both install as polyfills pretext discovers naturally (`OffscreenCanvas`,
`Intl.Segmenter`), so pretext itself runs **unmodified**.

## Install

```bash
npm i @wingleeio/pretext-native @chenglou/pretext
```

## Use

```ts
import { installPretextPolyfills, registerFont } from '@wingleeio/pretext-native';
import { prepare, layout } from '@chenglou/pretext';

installPretextPolyfills(); // before the first measurement
registerFont({ family: 'Inter', weight: 400, data: interTtfBytes });

const prepared = prepare('Hello, measured world', '16px Inter');
const { height } = layout(prepared, 320, 22); // pure math, Hermes-safe
```

With [`@wingleeio/mugen-native`](../mugen-native), all of this is wrapped by a
single `configureMugenNative({ fonts })` call.

## Accuracy notes

- Pair kerning (GPOS or legacy `kern`) is applied; **GSUB is not** — fonts with
  width-changing ligatures (`fi`, `fl`) drift by fractions of a pixel, and
  shaping-heavy scripts (Arabic joining, Indic conjuncts) are not modeled.
- Emoji outside your fonts' `cmap` measure at `emojiAdvanceEm` (default `1`) —
  tune via `installPretextPolyfills({ emojiAdvanceEm })`.
- The word-segmenter fallback splits CJK per code point (no dictionary); pretext
  treats CJK per-character anyway, so layout is self-consistent.

## Develop

```bash
pnpm --filter @wingleeio/pretext-native test         # hermetic — fonts are built in-test
pnpm --filter @wingleeio/pretext-native check-types  # compiles with no DOM lib at all
pnpm --filter @wingleeio/pretext-native build
```

`@wingleeio/pretext-native/testing` exports `buildTestFont` — a minimal binary
TTF builder for deterministic metrics in your own tests.
