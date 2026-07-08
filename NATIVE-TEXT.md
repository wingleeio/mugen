# Native text for mugen — one project

The goal: a never-opened 1,000-row markdown transcript opens in 1–2 frames on
an iPhone, with **zero cache infrastructure**. Everything below is one
integrated piece of work; the sections are components of a single change, not
stages.

## Why (measured, not guessed)

Profiled on comet's heaviest real session (107 messages → 1,002 block rows,
iPhone sim, dev-mode Hermes; prod is ~3–4× faster):

| Cost | Where it runs today | Measured |
|---|---|---|
| Text segmentation + advance measurement | `@chenglou/pretext` `prepareWithSegments`, **in JS** | ~2 ms per text node; 775 ms for one screen, cold |
| Line layout for paint | pretext `layoutWithLines` / rich-inline walk, **in JS** | 15–76 ms per screen |
| Markdown parse | incremark, in JS (LRU-cached) | 18 ms per screen |
| React fiber creation | ~10–30 components per markdown block row | **~600 ms per screen (~25 rows) — the floor** |

Desktop needs none of mugen's caches because Chromium does text in C++ and DOM
nodes are nearly free. The mobile app currently compensates with a persistent
height cache, a persistent paint-layout cache, a boot warmer that sweeps every
chat, and a wormhole scroll that fakes long-distance scrolling — all of that
exists **only because text math runs in JS and rows cost too many fibers**.
This project removes the causes so the compensations can be deleted.

Also verified (from legend-list's source, `useOnLayoutSync.native.tsx`): on
Fabric, `ref.measure()` is **synchronous** inside `useLayoutEffect` — you can
mount a view, let C++ lay it out, and read the true height back before paint.

## What pretext becomes

pretext is the text engine and it stays the text engine — the *model* is
right; only the *runtime* is wrong. Today: `@chenglou/pretext` (TS, models the
browser's line breaker on canvas metrics) + `@wingleeio/pretext-native` (feeds
it font metrics parsed from TTF tables in JS, plus a JS `Intl.Segmenter`
path).

Build **pretext-core as a C++ JSI module** (Nitro Modules recommended; one
codebase for iOS/Android):

- Port the hot kernel: `prepare` / `prepareWithSegments` (whitespace
  normalization → segmentation → per-segment advance measurement → grapheme
  pre-measure for long words → emoji correction), `layout`,
  `layoutWithLines`, `measureNaturalWidth`, and the rich-inline walk
  (`walkRichInlineLineRanges` / materialization) used by styled runs.
- Segmentation via ICU (already on both platforms), advances from the same
  sfnt/TTF tables pretext-native already ships (port the table reader to C++,
  or HarfBuzz if simpler — the requirement is *identical advances to the
  current tables*, not shaping perfection).
- **The break model must be pretext's** (CSS `white-space: normal` +
  `overflow-wrap: break-word` + its punctuation-merge and CJK rules), not raw
  UAX#14. pretext's existing accuracy/browser tests become golden fixtures:
  run TS pretext and pretext-core over the same corpus (include comet's real
  transcripts) and require **byte-identical break points and heights**. Wire
  this as a CI job, not a one-off check.
- API surface: synchronous JSI calls mirroring `pretext/measure.ts`
  (`textHeight`, `layoutWithLines`, natural width, rich-inline). mugen's
  measure code keeps its call sites; only the import changes. TS pretext
  remains the implementation for web and the reference for conformance.

Expected: ~2 ms/text → tens of microseconds. Measuring an entire 8,000-block
account becomes ~50 ms — cheaper than *hydrating* today's caches.

## One native view per block: `<MugenTextBlock>`

The fiber floor (~600 ms dev per screen) is React creating 10–30 components
per markdown row (stacks, per-run fragments, per-line texts). Desktop doesn't
pay this; DOM nodes are cheap. Fix it the way Chromium does:

- A Fabric native component that takes an **attributed-string spec** — runs of
  `{text, font, color, background, decoration, letterSpacing, noLigatures}`
  plus inline-box placeholders `{advance, height}` — and draws the whole block
  as **one native view** (TextKit / StaticLayout), using pretext-core's line
  breaks so painted geometry equals measured geometry exactly.
- mugen-markdown-native already computes exactly this data (`RichText`'s runs
  and fragments); the change is emitting one `<MugenTextBlock spec={…}>`
  instead of a fragment tree. Inline boxes (links-as-chips, inline code
  backgrounds if kept as views) overlay at the advances the spec reserved.
- A markdown block row drops from 10–30 fibers to 1–2. Expected cold-open
  render: ~600 ms dev → well under 100 ms dev (~20–30 ms prod) for a screen.
- Native selection across a block comes free and is better UX than per-Text
  selection.

## Render-measure as the completeness escape hatch

pretext models what it models. For content outside the model (system font
fallback glyphs, unusual emoji sequences, arbitrary embedded views), use the
legend-list trick *inside mugen's existing machinery*: mount the row, sync
`ref.measure()` in the commit, and feed the height through the engine's
existing estimate→`refineKeys`→anchor-absorption channel (built for
`lazyMeasure`; it already keeps the viewport stable under corrections). This
is an escape hatch, not the primary path — pretext-core stays authoritative so
offsets remain analytic and available without mounting anything.

## What this deletes (and the proof required before deleting each)

Deletion is the acceptance test. Each item goes only when its measurement
holds on the heaviest real session, prod bundle, device:

- **comet's height cache + boot warmer + painted-row markers, and mugen's
  `heightCache`/`lazyMeasure` machinery** — when a full cold measure of the
  heaviest chat is ≤ ~30 ms (pretext-core makes heights recomputable on
  demand).
- **The paint-layout cache (`setTextLayoutCache`, comet `paints_v1`)** — when
  first-paint layout via pretext-core is ≤ ~1 ms per screen.
- **The wormhole, capped glide, corridor/hidden-slot choreography, the
  `hopeless` velocity regime, and the height-budgeted bind machinery** — the
  wormhole exists only because painting a screenful of rows exceeded a frame.
  When a screenful binds in ≤ ~2 ms (`<MugenTextBlock>` + recycler), plain
  scrolling is paintable at any finger velocity: scroll-to-bottom becomes a
  plain animated scroll, and scroll-to-top becomes **the system status-bar
  flight again**, which also deletes comet's `scroll-to-top-intercept` native
  module and the permanently-bound top block (`addRange(0,…)`). Prove it with
  the existing harness: ffmpeg frame extraction + the text-presence strip
  detector + the continuity detector, 12-chained max flings and status-bar
  taps on the heavy session — zero blank frames, zero discontinuous pairs,
  with the wormhole code path disabled.
- **Possibly comet's pane pool** — keep it (it's how revisits beat desktop),
  but first visits should no longer need it to feel instant.

What stays untouched: the mugen engine itself — slots/recycling, analytic
offsets, origin absorption/headroom canvas, stick-to-bottom, the scroll
controller, and the public API. They are geometry consumers; this project
changes who computes the geometry and how much a row costs, nothing else.

## Verification protocol (already built, reuse it)

- In-app `[perf]` beacons: press→commit, first-commit duration, rows.
  (Prod bundles don't stream console — beacon to a local `python3 -u -m
  http.server`.)
- Screen truth: `simctl io recordVideo` → ffmpeg VFR frames →
  `/tmp/strip_detect.py` (24 text-presence strips) + `/tmp/continuity.py`
  (adjacent-frame alignment). Known false positives: top rubber-band,
  bounce overshoot.
- Baselines to beat (1,002-row session): cold open 846 ms dev / ~250 ms prod
  today; target ≤ 100 ms dev / ≤ 2 frames prod. Pooled revisit ~1 frame
  (keep). Scroll: zero blank frames at human max-fling without wormhole.
- Dev client rebuild recipe (RN 0.81 + Xcode 26): `RCT_USE_RN_DEP=1
  RCT_USE_PREBUILT_RNCORE=0 pod install` (deps prebuilt, core from source),
  `LANG=en_US.UTF-8`, then plain xcodebuild. A bare
  `__attribute__((constructor))` in a static archive is dead-stripped — put
  native installers in an ObjC `+load`.
