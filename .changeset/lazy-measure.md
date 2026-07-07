---
"@wingleeio/mugen": patch
---

Lazy measurement (`instance.lazyMeasure = { head, tail }`): a full (re)measure walks only the first `head` and last `tail` uncached rows; every other uncached row receives the running average as an estimate. Estimates refine via `refineEstimates(budgetMs)` (idle time, nearest-the-bottom first) and `ensureMeasured(key)` (the moment a row paints), with height deltas flowing through the scroll-anchor channel so the viewport never shifts. A cold heavy transcript opens in the time it takes to measure a few screens instead of the whole history.
