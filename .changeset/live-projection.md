---
'@wingleeio/mugen-native': patch
---

Continuous landing projection from LIVE velocity. The drag-release velocity only reflects the final drag, not accumulated momentum from chained flings, so the one-shot destination bind landed far short and got evicted by the next allocate. Now every scroll event projects the true stopping point from the measured velocity (st + v·r/(1−r)) and keeps that landing zone covered through the whole deceleration; assignment priority stays NEAR-FIELD-first (anchoring at the far destination starved what the viewport was about to cross). Lead deepens to min(4500, |v|·0.3) and the per-event rebind budget rises to 10 at extreme velocity. Verified with a text-presence frame analyzer: chained maximum flings at human-limit frequency in both directions, single rips, and reading scrolls — zero frames with a contiguous textless region.
