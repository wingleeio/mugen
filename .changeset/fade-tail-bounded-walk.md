---
"@wingleeio/mugen-markdown": patch
---

Make `<Markdown fade>`'s per-frame work flat regardless of answer length.

The fade painter positioned its veils by walking every text node of the streaming
block from offset 0 each animation frame to accumulate character offsets — O(total
length), ~60×/s the whole time text streams — and the `range.getClientRects()`
inside that loop forced a synchronous reflow of the ever-growing DOM. On a long
answer this was the remaining freeze.

Veils only ever cover the freshly-appended tail (`[length − veilSpan, length]`),
so the painter now positions at the last text node and walks **backward**,
deriving each node's offset from the running total (the length it already tracks
incrementally). That's O(veil span) per frame — constant in answer size — and it
only reads layout for the handful of tail nodes. Behaviour is identical.
