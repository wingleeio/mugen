---
'@wingleeio/mugen-native': patch
---

Programmatic scroll writes re-window rows at JS speed instead of waiting for the native onScroll round-trip, and writes larger than the overscan go through the anchor choreography. Previously the row window trailed the native offset by a frame, so a big instant jump — the stick-to-bottom catching up after a large live append, `scrollToBottom('instant')`, `scrollToItem` — could paint bare canvas for one frame (a visible black flash).
