---
"@wingleeio/mugen": patch
---

Memoize the height walk by element identity, so re-measuring a streaming row is
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
