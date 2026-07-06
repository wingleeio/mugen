---
'@wingleeio/mugen-native': patch
---

Scroll-anchor shifts (history prepends) apply atomically: the pending delta is consumed during render and shipped through the ScrollView's `contentOffset` prop, so the native side commits the taller content and the corrected offset in one transaction. The previous post-commit imperative scrollTo landed a frame late — every prepend flashed the content shifted down for one frame (visible flicker while paging history in).
