---
"@wingleeio/mugen": patch
---

Snap `stickToBottom` instantly on a font-settle re-measure instead of springing.
When web fonts load after the first paint, every row reflows at once and the
total height jumps — right after `initialScroll="bottom"`. Previously the
stick-to-bottom spring animated that correction, which read as a stray
"smooth scroll to bottom" on load (most visible with text-heavy rows, e.g.
`@wingleeio/mugen-markdown`). The font-driven growth now snaps, so the list
stays pinned at the bottom; content that genuinely streams in still springs.
