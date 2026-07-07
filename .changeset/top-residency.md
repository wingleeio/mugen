---
"@wingleeio/mugen-native": patch
---

Scroll-to-top (iOS status-bar tap) lands painted. The tap starts a fixed-duration native flight across the whole transcript that cannot be intercepted from JS on Fabric — programmatic scrolls are ignored while it runs and its scroll events coalesce behind commits — so the transcript TOP now simply stays bound at all times (a handful of slots, bound once by the post-open drain, never evicted): the flight always lands on painted ground. Also: velocity samples straddling a programmatic write no longer enter the velocity estimate (a jump is not motion), and the deferred big-jump scroll stamps itself for the same reason.
