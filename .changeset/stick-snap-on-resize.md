---
"@wingleeio/mugen": patch
---

Snap `stickToBottom` instantly on a viewport resize instead of springing. A
resize re-measures every row at the new width, so the total height jumps; while
pinned to the bottom, the spring animated that jump, which read as a janky
"scroll back to bottom" after the layout shifted. A resize (like a font settle)
now snaps, so the list stays pinned through the reflow; streaming content still
springs smoothly.
