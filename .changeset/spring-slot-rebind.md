---
"@wingleeio/mugen-native": patch
---

Programmatic smooth scrolls (scroll-to-bottom, scrollToItem) no longer re-render the list on every spring frame. onProgrammaticWrite now rebinds slots directly — the same O(rows crossing an edge) path onScroll uses — and rapid successive writes are recognized as animation frames (pre-binding a projected lookahead) instead of churning big-jump state per frame. Fixes scroll-to-bottom animating at slideshow fps in long transcripts.
