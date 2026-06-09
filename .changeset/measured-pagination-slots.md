---
"@wingleeio/mugen": minor
---

Add measured top/bottom slots to `MugenVList` (`renderTop` / `renderBottom`).
The slots render inside the scroll coordinate system and are measured like row
content, so loaders, sentinels, and skeletons offset the rows exactly — a clean
fit for bidirectional cursor pagination driven by `onTopReached` /
`onBottomReached`.

Also fix prepend anchoring: the scroll-anchor shift is now applied in a layout
effect instead of being consumed during render, so a re-render before commit no
longer drops it. Previously, prepending an older page could leave the viewport
pinned at the top and re-fire `onTopReached` in a loop.
