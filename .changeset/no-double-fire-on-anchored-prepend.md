---
"@wingleeio/mugen": patch
---

`onTopReached` no longer double-fires when a prepend's scroll re-anchoring is
clamped or overridden by the browser (e.g. an active touchpad gesture holding
the top edge). A re-anchored items change preserves visual continuity, so the
rows now at the edges are marked as already reached; previously the changed
first-row key counted as a fresh reach while the viewport was still pinned
within the threshold, immediately loading a second page from one gesture.
Replacing the window outright (no surviving anchor) still re-fires, and lists
shorter than the viewport still chain loads to fill it.
