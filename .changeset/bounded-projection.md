---
'@wingleeio/mugen-native': minor
---

Back to a BOUNDED recycling pool — instant navigation restored. The residency approach (no eviction + idle trickle) made switching away from a settled chat tear down hundreds of mounted rows and kept background JS churning: navigation lag. The pool is again ~1.6× the window (rows that leave are recycled; unmount is instant), and the blank-on-fling problem is solved where it belongs: (1) velocity-scaled lead binds ahead of the motion; (2) rows intersecting the viewport bypass the per-event rebind budget; and (3) FLING-DESTINATION PRE-BIND — iOS deceleration is deterministic (travel ≈ v·r/(1−r)), and pretext's exact offsets identify precisely which rows sit at the landing point, so `onScrollEndDrag` binds the landing zone the moment the finger lifts, long before deceleration is slow enough to read. The idle residency trickle is removed entirely.
