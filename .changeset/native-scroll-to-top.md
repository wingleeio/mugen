---
"@wingleeio/mugen-native": patch
---

Scroll-to-top and instant opens:

- **`scrollToTopDriver`** — `instance.scrollToTop({ behavior: 'smooth' })` now runs the same teleport-into-glide-range choreography as the long-distance `scrollToBottom` clamp: an atomic dual-window jump lands painted (the resident top block is the landing), then a short native glide finishes. Apps intercept the iOS status-bar tap natively (`scrollViewShouldScrollToTop:` → NO) and call this; the vlist's own ScrollView sets `scrollsToTop={false}` so the system flight (fixed-duration, unpaintable, uninterruptible from JS) never flies the transcript. A `testID` prop is forwarded to the ScrollView for the native intercept to key off.
- **Cold mounts bind their whole primary window in ONE commit.** Budgeting a fresh open turned it into a cascade of drain commits that janked the navigation animation; a single bounded commit reads instant. Budgets still apply to live paths (scroll events, streaming re-renders).
- **Two drain cadences.** Near starvation (scroll window, fling landing) drains on rAF as before; far-only starvation (the resident top block after an open) waits ~700ms of idle instead of competing with the open animation.
