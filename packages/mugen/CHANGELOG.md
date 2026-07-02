# @wingleeio/mugen

## 0.4.0

### Minor Changes

- [`0f01936`](https://github.com/wingleeio/mugen/commit/0f0193616ae78fb866f7be74bf79ceaa015a9614) Thanks [@wingleeio](https://github.com/wingleeio)! - Animated heights and row-scoped hooks.

  - `Collapse`: an animated disclosure primitive. Toggling `open` tweens the row's **committed** height between 0 and the children's measured natural height — each frame re-measures the row and paints a clipped box of exactly that height, so offsets, total scroll height and paint agree mid-flight. Content that grows while open (streaming) snaps instead of animating, composing with `stickToBottom`. Honors `prefers-reduced-motion`.
  - `useMugenTween(target, { duration, easing })`: an animated number for any declared dimension at the row root; retargets from the current value, driven by one shared animation clock per list.
  - `useMugenRow(id)`: row-scoped hooks (`state`/`memo`/`effect`/`tween`) usable in **nested components**, where the positional hooks can't go. Resolves through the ambient session in the measure walk and a stable-identity context in the React render (the context value never changes, so it never causes context re-renders); consumers self-subscribe to their row version so they stay fresh under memo-stable ancestor elements, and keyed-slot writes bump a per-row epoch that busts the walker's element-identity height memo the same way.

## 0.3.7

### Patch Changes

- Anchor the scroll position across top-slot height changes, not only item prepends. A `renderTop` whose height changes between renders (a loading skeleton appearing/disappearing, a growing header) sits above every row, so its delta shifted all of them and jumped the viewport. `sync()` now captures the top-visible keyed row before any re-measure — covering both prepends and slot-height changes — and skips only a full geometry reflow (resize / web-font settle), where `stickToBottom` owns the correction. This makes loading skeletons in the top slot toggle without the reader losing their place.

## 0.3.6

### Patch Changes

- [`1145ec5`](https://github.com/wingleeio/mugen/commit/1145ec5dee20a9d9a1f71b49c53333cd412eabac) Thanks [@wingleeio](https://github.com/wingleeio)! - Fix boxes widening past their measured size when they contain an unshrinkable
  wide subtree (e.g. a code block whose `<pre>` scrolls a long line). Flex items
  render with the default `min-width: auto`, which floors them at their content's
  min-content width — so a `VStack`/`HStack` would expand to the long line and
  overflow its column instead of letting the child scroll. The measure
  (`distribute`) already models proportional shrink with no such floor, so the
  render now pins `min-width: 0` on every box to match: overflowing content scrolls
  within the box, and the box stays at the width the walker computed. Most visible
  with a code block nested in a list item, but it applies to any wide child.

## 0.3.5

### Patch Changes

- [`0b3f5bc`](https://github.com/wingleeio/mugen/commit/0b3f5bc9f957df937a56bf9ce1b0b3256b6c17fa) Thanks [@wingleeio](https://github.com/wingleeio)! - Memoize the height walk by element identity, so re-measuring a streaming row is
  O(changed blocks) instead of O(whole row).

  The walker re-derived every row's height from scratch on each measure pass —
  re-invoking function components, recursing every block, and re-running pretext
  `layout()` at every leaf — with nothing cached across passes. During streaming a
  new `items` array each tick re-measures the growing answer in full, so it was
  O(answer length) per tick, O(n²) overall.

  A React element is immutable, so for a fixed `(width, defaults, fontEpoch)` the
  same element ref always measures to the same height. The walker now caches
  `(element) -> height` in a WeakMap and returns the cached value on a hit. Callers
  that hand back stable element refs for unchanged subtrees — which mugen-markdown
  already does via its per-block cache — then re-measure only the blocks that
  actually changed; a streaming row's settled blocks all hit, only its growing tail
  misses. The cache invalidates on a width or defaults change and when web fonts
  settle (`fontEpoch`).

  This also makes `toChildArray` flatten children without `Children.toArray` (which
  cloned every element to assign keys, handing the memo fresh refs each pass and
  defeating it); element refs are now preserved, keys being irrelevant to
  measurement. Adds `clearHeightCache()` for tests / memory pressure.

## 0.3.4

### Patch Changes

- [`240d4c3`](https://github.com/wingleeio/mugen/commit/240d4c39c01d139ea8c4b4153bd7e2caad0b7323) Thanks [@wingleeio](https://github.com/wingleeio)! - Fix `initialScroll="bottom"` when a mounted empty list shell later receives its
  first rows. Empty lists can still overflow because of top/bottom slots; if that
  happened, the initial bottom jump was marked complete before real rows arrived,
  and `stickToBottom` could smooth-scroll the first content load. Empty-to-nonempty
  now re-applies the initial bottom jump instantly.

## 0.3.3

### Patch Changes

- [`dbe2409`](https://github.com/wingleeio/mugen/commit/dbe24097c5bdb0941692bad6afc4e4cd1ad994d6) Thanks [@wingleeio](https://github.com/wingleeio)! - Force instant scroll jumps to bypass CSS `scroll-behavior: smooth`. Initial
  bottom/index placement and controller jumps now temporarily set the scroll
  element's inline scroll behavior to `auto` while writing `scrollTop`, then
  restore the previous style so app-level smooth scrolling cannot animate an
  instant initial jump.

## 0.3.2

### Patch Changes

- [`ec43322`](https://github.com/wingleeio/mugen/commit/ec4332285c95a94ed6079abdc05907673a08581b) Thanks [@wingleeio](https://github.com/wingleeio)! - Fix reused-route initial scrolling when a list changes from default top
  placement to `initialScroll="bottom"`. The list now treats a changed
  `initialScroll` target as a fresh initial-scroll request, so navigating from a
  main page into a chat page jumps to the chat bottom instantly instead of staying
  at top or letting `stickToBottom` perform the first move.

## 0.3.1

### Patch Changes

- [`6e218e0`](https://github.com/wingleeio/mugen/commit/6e218e0e4f9ba2433fa19376a3c5a69e1c5ccd49) Thanks [@wingleeio](https://github.com/wingleeio)! - Fix `initialScroll="bottom"` with `stickToBottom` when a mounted list is reused
  for a different page of data. Instant initial bottom placement now re-applies on
  page replacement and seeds the sticky baseline so the stick controller does not
  smooth-scroll what should be an instant initial jump.

- [`288f758`](https://github.com/wingleeio/mugen/commit/288f758b1171f26bebe774827cbdcf912daa500c) Thanks [@wingleeio](https://github.com/wingleeio)! - Keep the streaming tail above the fold while stuck to the bottom. The spring is
  a proportional controller, so continuously growing content left it trailing the
  bottom by ~11× the per-frame growth rate — 50–120px during fast streaming,
  enough to clip the trailing caret below the fold. The controller now estimates
  the content growth rate (EMA) and feeds it forward into the position step, with
  the spring handling only the residual at its stock gains, riding a rate-scaled
  buffer (~a wrapped line) behind the bottom so velocity stays continuous instead
  of stair-stepping against discrete line wraps. Measured during the AI-chat
  stream: median distance from bottom drops 47px → 13px with no loss of
  frame-rate-independent smoothness; the list still settles flush when the stream
  ends.

## 0.3.0

### Minor Changes

- [#7](https://github.com/wingleeio/mugen/pull/7) [`a506d02`](https://github.com/wingleeio/mugen/commit/a506d02ae10658491d6a5c2e843715d34105dfb4) Thanks [@wingleeio](https://github.com/wingleeio)! - Measure `HStack` width distribution the way flexbox paints it. Unfixed children
  take their **content** width (matching the rendered `flex: 0 1 auto`) and
  shrink proportionally on overflow, instead of an equal split the DOM never
  performs — which wrapped text in the measure pass that paints on one line and
  inflated row heights (most visibly on mobile widths). `MeasurableDef` gains an
  optional `naturalWidth(props, ctx)` for custom primitives (implemented for
  `Text` and all boxes; rows containing a primitive without it fall back to the
  equal split), plus an `outOfFlow` flag so `Portal` no longer consumes a width
  share or a gap it never paints. New exports: `naturalWidthOf`, `isOutOfFlow`.

  Boxes also now neutralize UA styles the walker can't see (`margin`, `border`,
  default `padding`, `content-box` sizing on tags like `blockquote`/`button`),
  and `Text` pins ligatures/letter-spacing inline so page CSS (e.g. a global
  `code { font-feature-settings: 'liga' 0 }`) can't change glyph widths under
  measured text.

- [`23cd712`](https://github.com/wingleeio/mugen/commit/23cd712e99c4628420a2d258df9c4f8654af4a37) Thanks [@wingleeio](https://github.com/wingleeio)! - Add the `Escape` primitive — a fixed-size box that escapes the walker. It stays
  in the row's flow at a declared `height` (border-box, pinned inline, overflow
  clipped) with an optional `width` (laid out as a fixed `HStack` sibling and
  reported as the natural width), but its children are **never walked** — so they
  may be arbitrary non-primitive React. A complete off-the-shelf overlay — a
  shadcn/ui or Radix Tooltip, Popover, DropdownMenu, or Dialog, _trigger
  included_ — drops straight into a row; those libraries portal their floating
  content to `document.body` themselves, where mugen's layout never sees it. The
  contract is `foreignObject`'s: mugen reserves exactly the box you declare, and
  you design the children within it.

  Deprecate `Portal` in its favour. It keeps working, but a separate
  measured-as-0 out-of-flow half is no longer needed for overlays with a known
  in-row footprint — the whole widget, trigger included, lives inside an
  `Escape`.

- [`91d1402`](https://github.com/wingleeio/mugen/commit/91d14021a131fdaea097e68182d6189e14bf69c3) Thanks [@wingleeio](https://github.com/wingleeio)! - Expose `markPrimitive` (plus the `MeasureContext` and `MeasurableDef` types) so
  external packages can define custom measurable primitives — a primitive with a
  bespoke `measure()`, not just the tag-backed layout boxes `definePrimitive`
  creates. This is the extension point `@wingleeio/mugen-markdown` builds its
  rich inline-text primitive on.

- [`91d1402`](https://github.com/wingleeio/mugen/commit/91d14021a131fdaea097e68182d6189e14bf69c3) Thanks [@wingleeio](https://github.com/wingleeio)! - Render text with line-height folded into the `font` shorthand
  (`"16px/22px Inter"`) instead of setting `font` plus a separate `lineHeight`.
  React warns ("don't mix shorthand and non-shorthand properties") whenever such
  an element re-renders — which floods the console during streaming/animated rows.
  The computed line-height is unchanged, so analytic heights still match the paint.
  Exposes the `fontWithLineHeight(font, lineHeight)` helper for building custom
  measurable primitives the same way.

- [`80a9aa4`](https://github.com/wingleeio/mugen/commit/80a9aa4817303c0467c60c63091c3d6b0334c391) Thanks [@wingleeio](https://github.com/wingleeio)! - Add measured top/bottom slots to `MugenVList` (`renderTop` / `renderBottom`).
  The slots render inside the scroll coordinate system and are measured like row
  content, so loaders, sentinels, and skeletons offset the rows exactly — a clean
  fit for bidirectional cursor pagination driven by `onTopReached` /
  `onBottomReached`.

  Also fix prepend anchoring: the scroll-anchor shift is now applied in a layout
  effect instead of being consumed during render, so a re-render before commit no
  longer drops it. Previously, prepending an older page could leave the viewport
  pinned at the top and re-fire `onTopReached` in a loop.

- [`4f5d034`](https://github.com/wingleeio/mugen/commit/4f5d0345bca269f976283cad013dd9647b433dd2) Thanks [@wingleeio](https://github.com/wingleeio)! - Add the `Portal` primitive — the sanctioned way to put out-of-flow content
  (a tooltip popover, dropdown menu, dialog panel) in a row. Its `measure()`
  returns 0 _without recursing_, so the subtree inside is never walked and may be
  arbitrary non-primitive React (a Radix/floating-ui overlay), while the trigger
  that anchors it stays in the row and is measured normally. Renders its children
  portaled to `document.body` by default (`container` overridable; `null` renders
  inline for self-positioned content).

  Also expose `measureChildren` (the standard vertical-stack measure) and
  `toChildArray`, so a custom primitive can pair a bespoke hook-using render with
  the usual child measurement. Adds `react-dom` as a peer dependency.

### Patch Changes

- [`3475d06`](https://github.com/wingleeio/mugen/commit/3475d0672ef7c18d8309cad84f577b3c3a8f2c33) Thanks [@wingleeio](https://github.com/wingleeio)! - Render text with font longhands instead of the `font` shorthand. Mixing the
  shorthand with the pinned shaping longhands (`fontFeatureSettings`,
  `fontVariantLigatures`) made React warn on every re-render while streaming.
  `Text` and `RichText` now expand the measurable font shape into
  `fontStyle`/`fontWeight`/`fontSize`/`lineHeight`/`fontFamily` (with
  `fontStretch` pinned to `normal`), painting identically — verified by the
  browser paint-parity suites. The helper is exported as `fontLonghands`.

- [#7](https://github.com/wingleeio/mugen/pull/7) [`5f69471`](https://github.com/wingleeio/mugen/commit/5f69471b4e3c172e22a0f66ce261821938dbf471) Thanks [@wingleeio](https://github.com/wingleeio)! - Read a fixed `width` through composed components when distributing `HStack`
  width. A plain component whose root primitive declares `width` (an icon, an
  avatar) renders as a `flex: 0 0 width` item in the DOM, but the measure pass
  treated it as a grow child and split the row equally — wrapping siblings at a
  width the DOM never uses. On mobile widths this overestimated row heights
  (visible as growing empty space under a streaming chat row with tool cards).

- [`4f5d034`](https://github.com/wingleeio/mugen/commit/4f5d0345bca269f976283cad013dd9647b433dd2) Thanks [@wingleeio](https://github.com/wingleeio)! - Allow React Fragments (`<>…</>`) in a row's tree. A Fragment paints no box, so
  the walker now treats it as transparent — splicing its children in place and
  measuring them as ordinary siblings — instead of throwing "not a measurable
  primitive". Fragment children are flattened in `toChildArray` too, so box chrome
  (gaps, `HStack` width distribution) counts the real children and the analytic
  height matches the render.

- [`6e4c816`](https://github.com/wingleeio/mugen/commit/6e4c8161abbfc357e29e66c0ba1d5fdfbd5e69ed) Thanks [@wingleeio](https://github.com/wingleeio)! - `onTopReached` no longer double-fires when a prepend's scroll re-anchoring is
  clamped or overridden by the browser (e.g. an active touchpad gesture holding
  the top edge). A re-anchored items change preserves visual continuity, so the
  rows now at the edges are marked as already reached; previously the changed
  first-row key counted as a fresh reach while the viewport was still pinned
  within the threshold, immediately loading a second page from one gesture.
  Replacing the window outright (no surviving anchor) still re-fires, and lists
  shorter than the viewport still chain loads to fill it.

- [`91d1402`](https://github.com/wingleeio/mugen/commit/91d14021a131fdaea097e68182d6189e14bf69c3) Thanks [@wingleeio](https://github.com/wingleeio)! - Make `instance.scrollToBottom()` reliable on a streaming list. It now runs
  through the scroll controller — springing to the bottom (for `smooth`) while
  re-targeting it every frame, and re-engaging the stick — instead of a one-shot
  native `scrollTo` aimed at the scroll height at call time. A native scroll
  undershoots a list that grows mid-scroll, which intermittently left a
  "scroll to bottom" button not actually sticking the user to the bottom.

- [`e9abff2`](https://github.com/wingleeio/mugen/commit/e9abff2ff280b99751528eb42457fd385419cbf6) Thanks [@wingleeio](https://github.com/wingleeio)! - Smooth out `stickToBottom` on mobile. The spring's velocity recurrence ran once
  per animation frame regardless of elapsed time, so under load (dropped frames —
  the common case on phones) it alternated lag and surge, which read as vertical
  jitter during the auto-scroll. The spring now integrates in fractional
  frame-sized substeps (identical dynamics at a steady 60Hz, frame-rate
  independent under jank; time-domain velocity roughness drops ~8× under a 6× CPU
  throttle), keeps a short warm window after reaching the bottom so each discrete
  growth step resumes from cruise velocity instead of a dead stop, and the scroll
  container sets `overflow-anchor: none` so native scroll anchoring can't fight
  mugen's own scroll writes.

- [`91d1402`](https://github.com/wingleeio/mugen/commit/91d14021a131fdaea097e68182d6189e14bf69c3) Thanks [@wingleeio](https://github.com/wingleeio)! - Re-engage `stickToBottom` whenever a scroll lands at the bottom, not only on an
  explicit downward move. If the user had scrolled up (escaping the stick) and then
  the content shrank back to the bottom — e.g. pressing a "replay"/"regenerate"
  button that resets the streaming row — the clamp left them pinned at the bottom
  but with a stale escape, so the new stream played below the fold without
  sticking. Landing at the bottom now clears the escape; a real scroll-up still
  moves past the bottom threshold before any such event, so it isn't swallowed.

- [`91d1402`](https://github.com/wingleeio/mugen/commit/91d14021a131fdaea097e68182d6189e14bf69c3) Thanks [@wingleeio](https://github.com/wingleeio)! - Snap `stickToBottom` instantly on a font-settle re-measure instead of springing.
  When web fonts load after the first paint, every row reflows at once and the
  total height jumps — right after `initialScroll="bottom"`. Previously the
  stick-to-bottom spring animated that correction, which read as a stray
  "smooth scroll to bottom" on load (most visible with text-heavy rows, e.g.
  `@wingleeio/mugen-markdown`). The font-driven growth now snaps, so the list
  stays pinned at the bottom; content that genuinely streams in still springs.

- [`91d1402`](https://github.com/wingleeio/mugen/commit/91d14021a131fdaea097e68182d6189e14bf69c3) Thanks [@wingleeio](https://github.com/wingleeio)! - Snap `stickToBottom` instantly on a viewport resize instead of springing. A
  resize re-measures every row at the new width, so the total height jumps; while
  pinned to the bottom, the spring animated that jump, which read as a janky
  "scroll back to bottom" after the layout shifted. A resize (like a font settle)
  now snaps, so the list stays pinned through the reflow; streaming content still
  springs smoothly.

- [#7](https://github.com/wingleeio/mugen/pull/7) [`73c8379`](https://github.com/wingleeio/mugen/commit/73c8379293bb9d06dbd46b320938aeb90a9151ba) Thanks [@wingleeio](https://github.com/wingleeio)! - Don't let an upward wheel break `stickToBottom` while the list doesn't overflow
  yet. On a short list nothing can scroll, so no scroll event would ever fire to
  re-engage the stick — a stray wheel-up before the content outgrew the viewport
  silently disabled sticking for the rest of the session.

## 0.2.2

### Patch Changes

- [`d6d40ea`](https://github.com/wingleeio/mugen/commit/d6d40eadbc6b1bf385dd5005a80ea016d42c156e) Thanks [@wingleeio](https://github.com/wingleeio)! - Fix `stickToBottom` over-triggering. Auto-scroll now fires only when the content actually grows (matching use-stick-to-bottom's resize-driven model) instead of on every render, so it no longer yanks you to the bottom when you're merely near it with static content. The stick also re-engages only on a real downward move, so a slow scroll-up reliably escapes instead of re-sticking between its own steps.

## 0.2.1

### Patch Changes

- [`d53d0f1`](https://github.com/wingleeio/mugen/commit/d53d0f150dca26717123d60f034e62993e018214) Thanks [@wingleeio](https://github.com/wingleeio)! - Fix `stickToBottom` overpowering a slow scroll-up: the stick now breaks on any upward move and re-engages only when returning toward the bottom, instead of re-sticking whenever within the "near bottom" threshold. Touch drags that pull up before lifting near the bottom no longer snap back.

## 0.2.0

### Minor Changes

- [`804996d`](https://github.com/wingleeio/mugen/commit/804996df231cabe1b52ec6b454f98c05206ef129) Thanks [@wingleeio](https://github.com/wingleeio)! - Add `useMugenSelector` for subscribing to the list's scroll state and rendering from a derived slice (Zustand/Redux-style), so a component re-renders only when the selected value changes. Also exposes `MugenInstance.getScrollState()`, `setScrollTop()`, and `scrollToBottom()`, and the `MugenScrollState` type — enough to build a floating scroll-to-bottom button that reacts to scroll position.

## 0.1.0

### Minor Changes

- [`4ada87c`](https://github.com/wingleeio/mugen/commit/4ada87c38c119d242cab63f349587e534fd744e5) Thanks [@wingleeio](https://github.com/wingleeio)! - Initial public release.
