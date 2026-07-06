---
'@wingleeio/mugen-native': minor
---

mugen now draws its own scroll indicator: a native-driver overlay whose proportion and position come from the engine's exact heights, replacing the platform indicator (which misreads the iOS headroom canvas and visibly resizes as history loads). It shows on user scrolls, tracks every frame on the UI thread with zero JS, and fades on idle; programmatic and streaming scrolls never flash it. `showsVerticalScrollIndicator={false}` hides it. Also: `useMugenVirtualizer({ heightCache })` plugs a persistent height store into the engine, and `CANVAS_HEADROOM` is exported for tests.
