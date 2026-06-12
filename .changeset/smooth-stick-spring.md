---
"@wingleeio/mugen": patch
---

Smooth out `stickToBottom` on mobile. The spring's velocity recurrence ran once
per animation frame regardless of elapsed time, so under load (dropped frames —
the common case on phones) it alternated lag and surge, which read as vertical
jitter during the auto-scroll. The spring now integrates in fractional
frame-sized substeps (identical dynamics at a steady 60Hz, frame-rate
independent under jank; time-domain velocity roughness drops ~8× under a 6× CPU
throttle), keeps a short warm window after reaching the bottom so each discrete
growth step resumes from cruise velocity instead of a dead stop, and the scroll
container sets `overflow-anchor: none` so native scroll anchoring can't fight
mugen's own scroll writes.
