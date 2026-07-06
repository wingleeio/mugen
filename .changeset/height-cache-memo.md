---
'@wingleeio/mugen': minor
---

Row-height memoization + pluggable persistent height cache. The instance now memoizes each row's height by item identity — an append re-walks only the new row instead of the entire list (each streamed token batch used to re-measure every row: free under a JIT, ruinous on Hermes). `instance.heightCache` accepts a `MugenHeightCache` (get/set by key+width): heights are pure functions of (content, width, fonts), so an app that persists them opens a list with every offset known and walks zero rows. `invalidate` updates the memo but never writes the store, so persisted heights stay default-state. Geometry/font changes clear the memo.
