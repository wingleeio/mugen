---
"@wingleeio/mugen": minor
"@wingleeio/mugen-native": minor
---

Render-measure escape hatch for content the analytic engine can't model.

`MugenInstance.applyMeasuredHeight(key, height)` overrides a row's recorded
height with one read from a live mount and routes it through the existing
estimate→anchor-absorption channel (the same path `refineOne`/prepend use), so
the viewport stays stable and the non-default height is never written to the
persistent cache. Exposed on `SlotHost` and via `MugenRowScope.renderMeasure`
(a no-op during the measure walk).

`mugen-native` adds `useRenderMeasure(id)`: attach its `ref`/`onLayout` to a
row's root and it reads the true height synchronously from `ref.measure()` in a
layout effect (synchronous on Fabric) and feeds it back — for system fallback
glyphs, unusual emoji sequences, or arbitrary embedded views that pretext
doesn't model. pretext-core stays authoritative for everything it does model.
