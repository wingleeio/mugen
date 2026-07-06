---
'@wingleeio/pretext-native': patch
---

Memoize pair kerning per glyph pair on the parsed font. Every adjacent glyph pair in every measured string consults kerning, and the GPOS path costs a handful of DataView reads per call — cheap on JIT engines, dominant on Hermes (no JIT; DataView methods are VM calls). Running text has a small set of distinct bigrams, so the memo collapses steady-state kerning to one Map hit.
