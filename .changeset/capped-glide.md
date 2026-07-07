---
"@wingleeio/mugen-native": patch
---

Scroll-to-top/bottom is now an HONEST full-distance smooth scroll (replacing the corridor/wormhole approach): the capped glide scrolls every real pixel of the journey with velocity clamped to the recycler's measured paintable regime (15k px/s), soft-braking into the target and re-engaging the stick at the bottom. Every frame is real content at its real position; a touch cancels it like any programmatic scroll. Also: rows about to paint resolve estimated heights instantly (`ensureMeasured`), idle drains refine remaining estimates, and `useMugenVirtualizer` accepts `lazyMeasure`.
