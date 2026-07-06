---
'@wingleeio/mugen-native': minor
---

Resident mode: `overscan={Infinity}` keeps every row mounted and makes scrolling cost ZERO JavaScript — no row window chases the scroll position, so no fling velocity can outrun it into bare canvas. Exact analytic heights are what make this affordable: rows position absolutely without measurement, and under the iOS origin-canvas scheme an existing row's coordinates are invariant across history prepends, so resident rows never re-render while history loads. This is the mode chat transcripts should use once content is height-cached; windowed mode remains the default. Also adds a `showsVerticalScrollIndicator` passthrough.
