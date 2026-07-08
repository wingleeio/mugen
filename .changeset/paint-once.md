---
"@wingleeio/mugen-native": patch
---

First paints stop re-running the JS text engine. Two changes born from profiling a 1002-row transcript whose cold open spent 775ms in `prepareWithSegments` (segmentation is ~2ms per text node on Hermes — the browser does this in C++, which is why the same list opens instantly on the web):

- **Text layout store** (`setTextLayoutCache`): text layouts — pretext's broken lines joined with `\n`, plus count/height/width — are pure functions of (text, font, options, width, line-height). With a store attached they are computed exactly once per key: the native `Text`'s MEASURE half primes the store during any walk (a boot warmer's background sweep leaves every session paint-ready), the render half consumes it, and an app that persists entries (sqlite, like a height cache) makes first paints segmentation-free across launches. The `set` callback receives the row key when known so volatile (streaming) rows can be skipped.

- **Bounded cold mounts**: a first mount used to bind its whole primary window (viewport + overscan) in one commit — 40-80 heavy markdown rows rendered synchronously while the user watched nothing happen. Cold mounts now share every other path's budget: bind the visible screen, drain the overscan invisibly after the commit. The mount also skips the scroll-to-top landing exemption (the drain binds the transcript top within a few frames, far sooner than a human can reach the status bar after an open).
