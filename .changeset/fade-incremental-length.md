---
"@wingleeio/mugen-markdown": patch
---

Fix `<Markdown fade>` lagging on long streams. The fade painter rebuilt the
container's whole text string every animation frame to diff it — O(n) per frame,
plus a fresh n-char allocation each time — so a long answer got progressively
jankier as it grew. It now tracks the content length incrementally from the
MutationObserver records (exact `characterData` deltas, bounded `childList`
subtree lengths), so a streaming tick costs O(delta) and a frame never walks the
whole content. Reconciles against the DOM when the block settles, so length can't
drift. Behaviour is unchanged — just no longer O(n) per tick.

(The markdown parser was already prefix-incremental — a growing source appends
only its delta to a retained incremark parser.)
