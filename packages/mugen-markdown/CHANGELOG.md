# @wingleeio/mugen-markdown

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
