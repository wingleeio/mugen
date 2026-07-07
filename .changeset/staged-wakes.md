---
"@wingleeio/mugen-native": patch
---

Faster heavy session-switch + crash safety on data swaps, without regressing correctness:

1. **Tighter synchronous bind budget on the RENDER path** (a data swap / session switch): one viewport-and-a-bit (`vh*1.2`) instead of two, so switching into a heavy chat reconciles only the visible screen in the blocking commit (measured ~300ms → ~140ms of paint) and the overscan fills via the drain. Viewport rows and the scroll-to-top top-landing zone are exempt from the budget (they must always bind); the scroll path keeps its larger lead budget.

2. **Root guard against `render(undefined)`**: a stale pooled-slot index can reach the measure/render during a data swap (rapid session switch); `put()` now skips binding a slot whose `itemAt(i)` is nullish/out-of-range, and the engine (see the mugen changeset) returns an empty tree / zero height instead of invoking the app renderer with `undefined`. A virtualizer must never crash on a transient hole mid-swap.

3. **Post-commit wake stays simple and correct**: the render-phase allocate wakes every slot it reassigned in one post-commit pass. That set is already bounded by the render-path budget above, so it's cheap. (An attempt to defer "offscreen" wakes by gating visibility on `adapter.scrollTop` was reverted — on a switch that value still holds the OLD scroll position until `initialScroll` re-anchors after the effect, so the truly-visible rows were misjudged offscreen and never repainted: the transcript showed the previous chat's content. Bounding the dirty set via the budget removes the need for any visibility guessing.)
