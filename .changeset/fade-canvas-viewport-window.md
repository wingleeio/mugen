---
"@wingleeio/mugen-markdown": patch
---

Window the streaming-fade veil canvas to the scroll viewport instead of the full
content height. The canvas backing store is reallocated and `clearRect`-cleared
every animation frame; sizing it to the whole answer made that O(answer length) —
on a tall stream (e.g. a 17,600px answer) it cleared a multi-megapixel canvas at
60fps, pushing the worst frame past the 16.7ms budget and dropping frames as the
answer grew. The painter now sizes and positions the canvas to cover only the
visible band each frame (intersecting the content with its scrollable/clipping
ancestors and the window), so the per-frame cost is O(viewport) and flat
regardless of answer length. The veils only ever sit on the freshly-appended
tail, which stick-to-bottom keeps at the viewport's edge, so the window is
transparent: nothing visible changes.
