---
"@wingleeio/mugen-native": patch
---

Lazy-measure hardening: the bind window batch-refines estimates before slot assignment (one notification instead of a per-row storm — per-row resolution froze scrolling through unrefined territory), and the background refiner runs at a yielding cadence (10ms bursts / 60ms) until the whole list is exact — after which the engine behaves exactly like a fully pre-measured one. Measured worst case (fully cold cache, immediate hard scroll-up through estimates): longest frame gap 41ms, zero freezes.
