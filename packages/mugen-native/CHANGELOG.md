# @wingleeio/mugen-native

## 0.8.9

### Patch Changes

- [`f3da80b`](https://github.com/wingleeio/mugen/commit/f3da80b171a010e4fce21abe8196b5877035dce5) Thanks [@wingleeio](https://github.com/wingleeio)! - Faster heavy session-switch + crash safety on data swaps, without regressing correctness:

  1. **Tighter synchronous bind budget on the RENDER path** (a data swap / session switch): one viewport-and-a-bit (`vh*1.2`) instead of two, so switching into a heavy chat reconciles only the visible screen in the blocking commit (measured ~300ms → ~140ms of paint) and the overscan fills via the drain. Viewport rows and the scroll-to-top top-landing zone are exempt from the budget (they must always bind); the scroll path keeps its larger lead budget.

  2. **Root guard against `render(undefined)`**: a stale pooled-slot index can reach the measure/render during a data swap (rapid session switch); `put()` now skips binding a slot whose `itemAt(i)` is nullish/out-of-range, and the engine (see the mugen changeset) returns an empty tree / zero height instead of invoking the app renderer with `undefined`. A virtualizer must never crash on a transient hole mid-swap.

  3. **Post-commit wake stays simple and correct**: the render-phase allocate wakes every slot it reassigned in one post-commit pass. That set is already bounded by the render-path budget above, so it's cheap. (An attempt to defer "offscreen" wakes by gating visibility on `adapter.scrollTop` was reverted — on a switch that value still holds the OLD scroll position until `initialScroll` re-anchors after the effect, so the truly-visible rows were misjudged offscreen and never repainted: the transcript showed the previous chat's content. Bounding the dirty set via the budget removes the need for any visibility guessing.)

- Updated dependencies [[`f3da80b`](https://github.com/wingleeio/mugen/commit/f3da80b171a010e4fce21abe8196b5877035dce5)]:
  - @wingleeio/mugen@0.6.8

## 0.8.8

### Patch Changes

- [`c0246f8`](https://github.com/wingleeio/mugen/commit/c0246f886cd0a32190d3b240590c56e43ed84fe6) Thanks [@wingleeio](https://github.com/wingleeio)! - Lazy-measure hardening: the bind window batch-refines estimates before slot assignment (one notification instead of a per-row storm — per-row resolution froze scrolling through unrefined territory), and the background refiner runs at a yielding cadence (10ms bursts / 60ms) until the whole list is exact — after which the engine behaves exactly like a fully pre-measured one. Measured worst case (fully cold cache, immediate hard scroll-up through estimates): longest frame gap 41ms, zero freezes.

- Updated dependencies [[`c0246f8`](https://github.com/wingleeio/mugen/commit/c0246f886cd0a32190d3b240590c56e43ed84fe6)]:
  - @wingleeio/mugen@0.6.7

## 0.8.7

### Patch Changes

- [`8f7b88a`](https://github.com/wingleeio/mugen/commit/8f7b88acfc97fda52c1903368b9c186c30630e6f) Thanks [@wingleeio](https://github.com/wingleeio)! - Scroll-to-top/bottom is now an HONEST full-distance smooth scroll (replacing the corridor/wormhole approach): the capped glide scrolls every real pixel of the journey with velocity clamped to the recycler's measured paintable regime (15k px/s), soft-braking into the target and re-engaging the stick at the bottom. Every frame is real content at its real position; a touch cancels it like any programmatic scroll. Also: rows about to paint resolve estimated heights instantly (`ensureMeasured`), idle drains refine remaining estimates, and `useMugenVirtualizer` accepts `lazyMeasure`.

- Updated dependencies [[`8f7b88a`](https://github.com/wingleeio/mugen/commit/8f7b88acfc97fda52c1903368b9c186c30630e6f)]:
  - @wingleeio/mugen@0.6.6

## 0.8.6

### Patch Changes

- [`64717fe`](https://github.com/wingleeio/mugen/commit/64717fe8198dc1f56b36953067ff4e50e86785fb) Thanks [@wingleeio](https://github.com/wingleeio)! - Wormhole scroll: `scrollToTop`/`scrollToBottom` from ANY distance is one CONTINUOUS motion — no cut, no blank, no fps drop. A long jump cannot honestly animate its full distance (crossing 100k px at readable pace is unpaintable) and a teleport-then-glide shows a hard content swap. Slots are absolutely positioned on mugen's canvas, so the destination's real neighborhood is temporarily laid out flush against the current viewport (snapped to a row boundary — edge-to-edge seam, overscan neighbors hidden invisibly), the list glides exactly one viewport of real pixels on the UI thread, and coordinates re-normalize atomically through the headroom canvas's origin absorption — identical pixels, native offset untouched, the same mechanism prepends use. A finger grab mid-glide normalizes instantly and the drag continues from exactly what's on screen. Measured on an 8MB transcript: 63-67fps, zero blank frames, zero discontinuous frame pairs, both directions.

## 0.8.5

### Patch Changes

- [`d566dc3`](https://github.com/wingleeio/mugen/commit/d566dc38b4fdac12cc1fa190752d53e60dd960a0) Thanks [@wingleeio](https://github.com/wingleeio)! - Scroll-to-top and instant opens:

  - **`scrollToTopDriver`** — `instance.scrollToTop({ behavior: 'smooth' })` now runs the same teleport-into-glide-range choreography as the long-distance `scrollToBottom` clamp: an atomic dual-window jump lands painted (the resident top block is the landing), then a short native glide finishes. Apps intercept the iOS status-bar tap natively (`scrollViewShouldScrollToTop:` → NO) and call this; the vlist's own ScrollView sets `scrollsToTop={false}` so the system flight (fixed-duration, unpaintable, uninterruptible from JS) never flies the transcript. A `testID` prop is forwarded to the ScrollView for the native intercept to key off.
  - **Cold mounts bind their whole primary window in ONE commit.** Budgeting a fresh open turned it into a cascade of drain commits that janked the navigation animation; a single bounded commit reads instant. Budgets still apply to live paths (scroll events, streaming re-renders).
  - **Two drain cadences.** Near starvation (scroll window, fling landing) drains on rAF as before; far-only starvation (the resident top block after an open) waits ~700ms of idle instead of competing with the open animation.

- Updated dependencies [[`d566dc3`](https://github.com/wingleeio/mugen/commit/d566dc38b4fdac12cc1fa190752d53e60dd960a0)]:
  - @wingleeio/mugen@0.6.5

## 0.8.4

### Patch Changes

- [`3512b4b`](https://github.com/wingleeio/mugen/commit/3512b4bb5f3b15210df0cd2e13ab38f1b1e61902) Thanks [@wingleeio](https://github.com/wingleeio)! - Scroll-to-top (iOS status-bar tap) lands painted. The tap starts a fixed-duration native flight across the whole transcript that cannot be intercepted from JS on Fabric — programmatic scrolls are ignored while it runs and its scroll events coalesce behind commits — so the transcript TOP now simply stays bound at all times (a handful of slots, bound once by the post-open drain, never evicted): the flight always lands on painted ground. Also: velocity samples straddling a programmatic write no longer enter the velocity estimate (a jump is not motion), and the deferred big-jump scroll stamps itself for the same reason.

## 0.8.3

### Patch Changes

- [`8673ef6`](https://github.com/wingleeio/mugen/commit/8673ef668231edc50f1aeeb9fe37d2672000929a) Thanks [@wingleeio](https://github.com/wingleeio)! - Heavy-session fling overhaul — three fixes measured on a 100k-px transcript:

  - **Height-budgeted rebinds.** The per-event fresh-bind budget is now measured in content height (pretext gives every row height analytically), not row count. A count budget let one scroll event batch several very heavy rows into a single multi-hundred-ms React commit, which starved scroll events and blanked the whole transit.
  - **Landing-first regime at unpaintable speeds.** Once the viewport turns over faster than a bind can reach the screen (extreme chained momentum), near-field binding is provably wasted; assignment priority flips to the projected fling landing so the destination is painted when deceleration becomes readable. At bindable speeds near-field-first is unchanged.
  - **Settle drain.** A budget-starved allocate now schedules a follow-up pass; previously a scroll that settled before its window was bound had no further events to finish the job and the screen stayed bare until the next input. Also: velocity samples closer than half a frame (queue drains after a JS stall) are rejected and the estimate is clamped — coalesced events used to read as millions of px/s and poison every velocity-gated decision.

- Updated dependencies [[`8673ef6`](https://github.com/wingleeio/mugen/commit/8673ef668231edc50f1aeeb9fe37d2672000929a)]:
  - @wingleeio/mugen@0.6.4

## 0.8.2

### Patch Changes

- [`aacc7df`](https://github.com/wingleeio/mugen/commit/aacc7df0b6d6414d775d80db684389636030b0c3) Thanks [@wingleeio](https://github.com/wingleeio)! - Programmatic smooth scrolls (scroll-to-bottom, scrollToItem) no longer re-render the list on every spring frame. onProgrammaticWrite now rebinds slots directly — the same O(rows crossing an edge) path onScroll uses — and rapid successive writes are recognized as animation frames (pre-binding a projected lookahead) instead of churning big-jump state per frame. Fixes scroll-to-bottom animating at slideshow fps in long transcripts.

## 0.8.1

### Patch Changes

- [`bdaaee6`](https://github.com/wingleeio/mugen/commit/bdaaee69bbdc9340d51e593de24bdd8e8ebb3e4d) Thanks [@wingleeio](https://github.com/wingleeio)! - Continuous landing projection from LIVE velocity. The drag-release velocity only reflects the final drag, not accumulated momentum from chained flings, so the one-shot destination bind landed far short and got evicted by the next allocate. Now every scroll event projects the true stopping point from the measured velocity (st + v·r/(1−r)) and keeps that landing zone covered through the whole deceleration; assignment priority stays NEAR-FIELD-first (anchoring at the far destination starved what the viewport was about to cross). Lead deepens to min(4500, |v|·0.3) and the per-event rebind budget rises to 10 at extreme velocity. Verified with a text-presence frame analyzer: chained maximum flings at human-limit frequency in both directions, single rips, and reading scrolls — zero frames with a contiguous textless region.

## 0.8.0

### Minor Changes

- [`02af2b7`](https://github.com/wingleeio/mugen/commit/02af2b7b20f415ed20a071a06c812894aa75db18) Thanks [@wingleeio](https://github.com/wingleeio)! - Back to a BOUNDED recycling pool — instant navigation restored. The residency approach (no eviction + idle trickle) made switching away from a settled chat tear down hundreds of mounted rows and kept background JS churning: navigation lag. The pool is again ~1.6× the window (rows that leave are recycled; unmount is instant), and the blank-on-fling problem is solved where it belongs: (1) velocity-scaled lead binds ahead of the motion; (2) rows intersecting the viewport bypass the per-event rebind budget; and (3) FLING-DESTINATION PRE-BIND — iOS deceleration is deterministic (travel ≈ v·r/(1−r)), and pretext's exact offsets identify precisely which rows sit at the landing point, so `onScrollEndDrag` binds the landing zone the moment the finger lifts, long before deceleration is slow enough to read. The idle residency trickle is removed entirely.

## 0.7.0

### Minor Changes

- [`801e4f5`](https://github.com/wingleeio/mugen/commit/801e4f587e0a4d50495cb1e6e5815abf52567657) Thanks [@wingleeio](https://github.com/wingleeio)! - Blank-proof scrolling: the slot pool converges to FULL residency. Three mechanisms compose: (1) NO EVICTION — a row mounted once stays mounted (its absolutely-positioned view is invisible offscreen and costs nothing per frame), so every region the user has crossed is permanently fling-proof; the pool grows on demand, with eviction only past a 5000-row cap. (2) An IDLE RESIDENCY TRICKLE mounts the not-yet-visited remainder a bounded batch per tick while the user isn't scrolling — priority: the viewport's vicinity, then from the chat top downward (the destination of every rip-to-the-top gesture). Within seconds of a chat settling, every row is mounted at its exact offset and NO fling at any velocity can reach unmounted canvas — scrolling costs zero fresh work. (3) During the convergence window, rows INTERSECTING the viewport bypass the per-event mounting budget, so landing in unassigned territory pops content in immediately instead of trickling. Also: velocity-scaled lead (up to 6000px), nearest-to-destination assignment order, and render-phase reallocation now REFRESHES resident rows' offsets (instead of clearing them) so streaming height shifts can't strand a stale row at a wrong position. Engine: adds `instance.indexOfKey`.

### Patch Changes

- Updated dependencies [[`801e4f5`](https://github.com/wingleeio/mugen/commit/801e4f587e0a4d50495cb1e6e5815abf52567657)]:
  - @wingleeio/mugen@0.6.3

## 0.6.1

### Patch Changes

- [`808d52d`](https://github.com/wingleeio/mugen/commit/808d52d896db4dcc49c5a8f124902485548d638d) Thanks [@wingleeio](https://github.com/wingleeio)! - Render-phase slot reassignments now deliver their notifications AFTER the commit (a layout effect wakes exactly the changed slots) instead of synchronously during `MugenVList`'s render — which was a cross-component setState-in-render (React: "Cannot update a component (`Slot`) while rendering a different component (`MugenVList`)"). Same-frame delivery, no visual change; onScroll reassignments still notify immediately (event handlers are legal).

## 0.6.0

### Minor Changes

- [`fbbff61`](https://github.com/wingleeio/mugen/commit/fbbff619b4c4a0feec728779e2e07545bc88bbb0) Thanks [@wingleeio](https://github.com/wingleeio)! - View recycling on React Native — the fix for hitchy scrolling on Hermes. Instead of mounting/unmounting rows at the window edges (each heavy markdown mount costs real frame time) and re-rendering the whole list every scroll frame, the native list keeps a FIXED POOL of stable-key slots and, on scroll, only reassigns WHICH row each slot shows via an external store the slots subscribe to individually. The list never re-renders on scroll; a reassigned slot REUSES its row's view tree (React reconciles new content into existing views) instead of destroying and recreating it, which for one-Text-node-per-block rows is a cheap content update. Verified: an 826-row transcript survives 26 rapid-fire flings with zero blank frames and no freezes.

  Engine: notifications that fire while a row session is ambient (the measure walk, or a row's `render(item)`) are now DEFERRED until the session unwinds. A notify can make React synchronously re-render a subscribed component; mid-walk that let a nested component's `useMugenRow` take the ambient (hook-free) path where a normal render takes the React-hook path, throwing "rendered fewer hooks than expected". Deferring guarantees any such re-render sees the correct path. Also adds `scrollIndicatorInsets` to inset the drawn indicator's track below a floating header and above a composer (ChatGPT-style) while content still scrolls full-height underneath.

### Patch Changes

- Updated dependencies [[`fbbff61`](https://github.com/wingleeio/mugen/commit/fbbff619b4c4a0feec728779e2e07545bc88bbb0)]:
  - @wingleeio/mugen@0.6.1

## 0.5.0

### Minor Changes

- [`b15061a`](https://github.com/wingleeio/mugen/commit/b15061a379959bf38dfc3e3004d11d8295b632d2) Thanks [@wingleeio](https://github.com/wingleeio)! - One native Text node per BLOCK, not per wrapped line. The native `Text` and `RichText` primitives materialized pretext's line breaks as one absolutely-positioned `<Text>` **per line** — so a 10-line paragraph was ~10 Fabric nodes versus the web's single node. Mounting a screenful of markdown was ~10× the view-creation cost of the web, which is what a fast fling outran into blank canvas. Now each block joins its lines at pretext's break points with hard `\n` into a single `<Text>` capped at the measured line count (`numberOfLines`), so height stays exact (a sub-pixel shaper disagreement clips instead of reflowing) and per-row mount cost matches the web. `RichText` collapses only runs of consecutive single-fragment, same-style lines (plain paragraphs — the common case); lines with inline marks, links, or an active streaming fade keep their per-fragment nodes.

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
