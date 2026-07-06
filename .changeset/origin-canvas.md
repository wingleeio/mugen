---
'@wingleeio/mugen-native': patch
---

Flash-proof anchoring and fling-proof windowing. On iOS, rows render into a headroom canvas whose origin moves UP as history prepends, with `contentInset` clamping the scrollable range — a prepend never issues a corrective scroll at all, so there is nothing to race on Fabric (the previous two-commit choreography still had a one-frame hazard between the native scroll landing and the counter-translation clearing; it remains as the Android path). Programmatic jumps beyond the overscan paint BOTH departure and destination windows for one commit. User flings get velocity-aware overscan: the row window leads in the scroll direction by up to 2400px, so a hard fling can no longer outrun the JS round-trip into bare canvas.
