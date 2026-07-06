# @wingleeio/mugen-markdown

## 0.6.0

### Minor Changes

- [`808d52d`](https://github.com/wingleeio/mugen/commit/808d52d896db4dcc49c5a8f124902485548d638d) Thanks [@wingleeio](https://github.com/wingleeio)! - Markdown tables now keep a reasonable minimum column width and scroll horizontally instead of crushing columns into per-character wrapping on narrow viewports (web and React Native).

  Each column gets a max-content width and a floor of `min(max-content, theme.table.minColumnWidth)` (default `96`). Widths resolve exactly the way CSS flexbox resolves `flex-grow: max-content; flex-basis: 0` cells with a `min-width` floor: wide viewports fill proportionally as before, and once the columns' minimums no longer fit the row the table overflows into a clipped, horizontally-scrolling viewport (scrollbar hidden on web, `ScrollView` on native) whose measured height still equals what it paints. Tune the floor via `theme.table.minColumnWidth`.

## 0.5.1

### Patch Changes

- [`30b0d87`](https://github.com/wingleeio/mugen/commit/30b0d87e6f96069b396beda212cef1041e6153f4) Thanks [@wingleeio](https://github.com/wingleeio)! - Upgrade `@chenglou/pretext` to 0.0.8. Line breaking no longer splits slash-joined word tokens ("pipeline/features/packages", "and/or") where browsers offer no break opportunity — computed row heights previously undershot the paint by one line whenever such a token straddled a wrap point, overlapping rows in virtualized transcripts. Includes a browser regression test with the real-world failing paragraph across nine widths.

## 0.5.0

### Minor Changes

- [`69b8e82`](https://github.com/wingleeio/mugen/commit/69b8e82fd5d04bc246a8cf220d80c30b961ca346) Thanks [@wingleeio](https://github.com/wingleeio)! - Add a `@wingleeio/mugen-markdown/native-core` entry (the renderer-agnostic
  pipeline — parsing, theme, dispatcher, tokenizer, primitive measure halves —
  with no react-dom in its module graph) and a `primitives` option on
  `renderMarkdown` so non-DOM renderers can inject their own `Stack`/`RichText`.
  Runtime imports now come from `@wingleeio/mugen/native-core` (same modules,
  react-dom-free), so the peer range floor moves to mugen 0.5. No behavior
  change for web consumers.

## 0.4.4

### Patch Changes

- [`9034d83`](https://github.com/wingleeio/mugen/commit/9034d837813a759537bacf9a3d04a4df2571cbb8) Thanks [@wingleeio](https://github.com/wingleeio)! - Add a subtle default border to fenced code blocks.

## 0.4.3

### Patch Changes

- [`8098ccd`](https://github.com/wingleeio/mugen/commit/8098ccdb19f1167e17b5403b408c7b422792a506) Thanks [@wingleeio](https://github.com/wingleeio)! - Window the streaming-fade veil canvas to the scroll viewport instead of the full
  content height. The canvas backing store is reallocated and `clearRect`-cleared
  every animation frame; sizing it to the whole answer made that O(answer length) —
  on a tall stream (e.g. a 17,600px answer) it cleared a multi-megapixel canvas at
  60fps, pushing the worst frame past the 16.7ms budget and dropping frames as the
  answer grew. The painter now sizes and positions the canvas to cover only the
  visible band each frame (intersecting the content with its scrollable/clipping
  ancestors and the window), so the per-frame cost is O(viewport) and flat
  regardless of answer length. The veils only ever sit on the freshly-appended
  tail, which stick-to-bottom keeps at the viewport's edge, so the window is
  transparent: nothing visible changes.

## 0.4.2

### Patch Changes

- [`ea23b23`](https://github.com/wingleeio/mugen/commit/ea23b231f2f4f1345adce0eb14f79e396cb1fac7) Thanks [@wingleeio](https://github.com/wingleeio)! - Make `<Markdown fade>`'s per-frame work flat regardless of answer length.

  The fade painter positioned its veils by walking every text node of the streaming
  block from offset 0 each animation frame to accumulate character offsets — O(total
  length), ~60×/s the whole time text streams — and the `range.getClientRects()`
  inside that loop forced a synchronous reflow of the ever-growing DOM. On a long
  answer this was the remaining freeze.

  Veils only ever cover the freshly-appended tail (`[length − veilSpan, length]`),
  so the painter now positions at the last text node and walks **backward**,
  deriving each node's offset from the running total (the length it already tracks
  incrementally). That's O(veil span) per frame — constant in answer size — and it
  only reads layout for the handful of tail nodes. Behaviour is identical.

## 0.4.1

### Patch Changes

- [`78a0b23`](https://github.com/wingleeio/mugen/commit/78a0b2317e6d5b284dab26eafc57c43fc72f5eb2) Thanks [@wingleeio](https://github.com/wingleeio)! - Fix `<Markdown fade>` lagging on long streams. The fade painter rebuilt the
  container's whole text string every animation frame to diff it — O(n) per frame,
  plus a fresh n-char allocation each time — so a long answer got progressively
  jankier as it grew. It now tracks the content length incrementally from the
  MutationObserver records (exact `characterData` deltas, bounded `childList`
  subtree lengths), so a streaming tick costs O(delta) and a frame never walks the
  whole content. Reconciles against the DOM when the block settles, so length can't
  drift. Behaviour is unchanged — just no longer O(n) per tick.

  (The markdown parser was already prefix-incremental — a growing source appends
  only its delta to a retained incremark parser.)

## 0.4.0

### Minor Changes

- [`787d89e`](https://github.com/wingleeio/mugen/commit/787d89eb4f0de8ea3a026c9c112ab6569377890f) Thanks [@wingleeio](https://github.com/wingleeio)! - Add measured **inline boxes** and an **inline-override API** — the pieces needed
  for custom inline content (citation pills, mentions, icons, badges) that wraps
  with the text yet keeps heights exact.

  - `RichTextRun` gains an inline-box variant: `{ advance, content }`. It's the
    inline twin of mugen's `Escape` — it reserves exactly `advance` px in the flow
    (backed by pretext's `extraWidth`) and paints arbitrary `content` without
    measuring its insides, wrapping as one non-breaking atom. The veil canvas adds
    zero measured height; the box's own height is paint-only.
  - `defineMarkdownComponents({ inline: { ... } })` overrides how an inline node
    (`link`, `strong`, `emphasis`, `inlineCode`, `text`, or a custom token via the
    index signature) flattens into runs — return your own runs (text and/or boxes)
    or `null` to fall back to the default. The override receives an
    `InlineRenderContext` with `fmt`, `font()`, `measure(text, font)`, and
    `runs()` for composing.
  - Exports `measureInline(text, font)` so callers can size a text box exactly
    (e.g. a pill is `measureInline(label, font) + paddingX`), plus the
    `FadeMarkdown` and `InlineComponents`/`InlineComponent`/`InlineRenderContext`
    types.

  Caveat: a box splits the inline flow, so the spaces around it are measured as
  inter-item gaps (like inline code or links). That carries pretext's sub-pixel
  gap rounding, which at an exact wrap boundary can shift a line — keep box widths
  deterministic and you'll only ever see it at a knife-edge width.

## 0.3.0

### Minor Changes

- [`3a93daf`](https://github.com/wingleeio/mugen/commit/3a93dafbed6a47dd9e94b44950fdc9e21d8561ac) Thanks [@wingleeio](https://github.com/wingleeio)! - Add a `fade` prop to `<Markdown>` for streaming fade-in. With `fade`, just-arrived
  text dissolves in as the source streams — the DOM still commits and lays out
  instantly (heights stay exact), and a background-coloured veil over the new
  characters is painted on a canvas and faded out, so the row never animates.

  It's self-contained: the veil canvas lives inside the markdown's own box (out of
  flow, so it adds zero measured height) and scrolls with the content — no
  list-level overlay or wiring required. The painter idles until a DOM mutation
  arrives, so leaving `fade` on for a settled block costs nothing, and it honours
  `prefers-reduced-motion`. Interactive chrome (e.g. a code block's copy button) is
  excluded from the veil's text tracking, so flipping "Copy" → "Copied" mid-stream
  can't trigger a re-veil. Also exports the `FadeMarkdown` primitive for advanced use.

## 0.2.0

### Minor Changes

- [`5690cfb`](https://github.com/wingleeio/mugen/commit/5690cfbeb9d6c4a67f495518f9ec85342bb300ea) Thanks [@wingleeio](https://github.com/wingleeio)! - Add an optional chrome header to the fenced code block — the language on the
  left, a copy-to-clipboard button on the right. Enable it through the theme with
  `code.header.show` (off by default, so existing blocks are unchanged). The bar
  is a fixed-height box whose height is folded into `CodeBlock`'s measured height,
  so a headered block still measures exactly what it paints. The header style
  (height, font size, colours, button fill) is themeable, and `CodeBlock` gains a
  `header` prop plus the `CodeBlockHeader` type for direct use.

## 0.1.0

### Minor Changes

- [`79e1935`](https://github.com/wingleeio/mugen/commit/79e1935f6082cd97a29c9713911382de52afc3f4) Thanks [@wingleeio](https://github.com/wingleeio)! - Non-blocking syntax highlighting for fenced code blocks, as pure paint over the
  DOM text. The `<pre><code>` renders plain text immediately and keeps owning
  layout/selection/copy; a built-in line-state tokenizer (ts/js, python, rust, go,
  c-family, shell, sql, css, html, json, yaml, … — extensible via
  `registerLanguage`) runs in time-sliced chunks off the critical path; token
  colours are painted onto viewport-lazy canvas tiles overlaying the text, and the
  DOM text flips to `color: transparent` in the same frame the paint lands.
  Highlighting therefore can never block first paint and can never change a
  block's measured height (`lines × lineHeight + padding` stays exact), and
  streaming appends re-tokenize/repaint only the changed tail. Themable via
  `theme.code.highlight` (token palette, or `false` to disable) and per-block via
  the `CodeBlock` `highlight` prop.

- [`4ee3e0b`](https://github.com/wingleeio/mugen/commit/4ee3e0bf9e3def31ee56097163beb8b67fbdd321) Thanks [@wingleeio](https://github.com/wingleeio)! - Only re-render the block being streamed. `<Markdown>` now memoizes rendered
  blocks by node reference (completed blocks keep a stable element across incremark
  appends, so React bails) with a content-signature fallback for sub-blocks inside
  incremark's re-parsed tail — so finished list items and table cells stop
  re-rendering while a later one streams in. Exposes `ctx.memo(node, variant,
build)` on the render context so custom `list`/`table` components get the same
  streaming bail-out. In a long streaming turn this cut block re-renders by ~15×.

- [`91d1402`](https://github.com/wingleeio/mugen/commit/91d14021a131fdaea097e68182d6189e14bf69c3) Thanks [@wingleeio](https://github.com/wingleeio)! - Initial release of `@wingleeio/mugen-markdown`: measurable markdown for mugen.

  Markdown is parsed with [incremark](https://www.incremark.com/) into an mdast
  tree and rendered entirely with mugen primitives, so the virtualizer's tree
  walker computes exact row heights (off-screen and never-mounted rows included).
  Inline rich text — mixed bold/italic/code/link runs in one wrapping flow — is
  measured by a new `RichText` primitive backed by `@chenglou/pretext`'s
  rich-inline layout, validated against the real DOM by a browser accuracy gate.
  Block-level nodes are overridable through a fully-typed `components` map and a
  deep-partial `theme`, both authored from the same primitives.

  Parsing is incremental automatically: when a row's `source` grows (streaming LLM
  output), only the new text is appended to a retained incremark parser, so a
  streaming message stays `O(delta)` per tick rather than re-parsing the whole
  prefix — while static rows are served from a parse cache.

- [`94f52cd`](https://github.com/wingleeio/mugen/commit/94f52cddecfc1b7b070fbfde8ae5e77c5038f32f) Thanks [@wingleeio](https://github.com/wingleeio)! - GFM tables now render as actual tables via a new `TableBlock` primitive.
  Columns share one set of widths across all rows — proportional to each
  column's max-content width (cells paint as `flex: ratio ratio 0`, and the
  measure runs the identical arithmetic, so heights stay exact at any width) —
  instead of each row flexing independently and misaligning. Visual chrome is
  height-neutral: hairline row dividers are real `theme.table.gap`-px elements,
  the outer ring is an inset box-shadow, and the corner radius is overflow
  clipping. New theme knobs: `table.borderColor` and `table.radius`.

### Patch Changes

- [`3475d06`](https://github.com/wingleeio/mugen/commit/3475d0672ef7c18d8309cad84f577b3c3a8f2c33) Thanks [@wingleeio](https://github.com/wingleeio)! - Render text with font longhands instead of the `font` shorthand. Mixing the
  shorthand with the pinned shaping longhands (`fontFeatureSettings`,
  `fontVariantLigatures`) made React warn on every re-render while streaming.
  `Text` and `RichText` now expand the measurable font shape into
  `fontStyle`/`fontWeight`/`fontSize`/`lineHeight`/`fontFamily` (with
  `fontStretch` pinned to `normal`), painting identically — verified by the
  browser paint-parity suites. The helper is exported as `fontLonghands`.

- [`241f128`](https://github.com/wingleeio/mugen/commit/241f128df539b6d3bc64f306bce54ece8e17fedf) Thanks [@wingleeio](https://github.com/wingleeio)! - Code-highlight canvas tiles now resolve visibility synchronously from scroll
  events on the block's scroll ancestors, painting in the same task as the
  scroll — before the frame renders — so a concealed block can never enter the
  viewport as a blank box. A viewport-rooted IntersectionObserver alone gave no
  prefetch inside nested scrollers (rootMargin doesn't extend a scroller's clip)
  and its async delivery flashed empty tiles during fast scrolling; it remains
  only as a backup signal for movement without scroll events. Tiles keep their
  painting until far outside the window (hysteresis) and free canvas memory
  beyond that.

- [#7](https://github.com/wingleeio/mugen/pull/7) [`a506d02`](https://github.com/wingleeio/mugen/commit/a506d02ae10658491d6a5c2e843715d34105dfb4) Thanks [@wingleeio](https://github.com/wingleeio)! - Make every rendered line box exactly `lineHeight` tall so painted heights equal
  `lines × lineHeight`: the `RichText` container now carries the flow's base font
  (a smaller inherited page font built a strut on a different baseline, stretching
  heading lines ~6px), runs render with zero leading so a mixed-font run (inline
  code) can't grow its line ~0.5px past `lineHeight`, and runs pin
  ligatures/letter-spacing against page CSS. The blockquote rule is painted with
  an inset `box-shadow` instead of a border (which consumed content width the
  walker couldn't see), `RichText` implements `naturalWidth` so table cells
  distribute like the painted flexbox, and a real-document browser accuracy gate
  asserts per-block computed === DOM exactly.
