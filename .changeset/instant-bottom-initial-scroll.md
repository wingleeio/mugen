---
"@wingleeio/mugen": patch
---

Fix `initialScroll="bottom"` with `stickToBottom` when a mounted list is reused
for a different page of data. Instant initial bottom placement now re-applies on
page replacement and seeds the sticky baseline so the stick controller does not
smooth-scroll what should be an instant initial jump.
