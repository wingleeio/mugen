---
"@wingleeio/mugen-markdown": patch
---

Code-highlight canvas tiles now resolve visibility synchronously from scroll
events on the block's scroll ancestors, painting in the same task as the
scroll — before the frame renders — so a concealed block can never enter the
viewport as a blank box. A viewport-rooted IntersectionObserver alone gave no
prefetch inside nested scrollers (rootMargin doesn't extend a scroller's clip)
and its async delivery flashed empty tiles during fast scrolling; it remains
only as a backup signal for movement without scroll events. Tiles keep their
painting until far outside the window (hysteresis) and free canvas memory
beyond that.
