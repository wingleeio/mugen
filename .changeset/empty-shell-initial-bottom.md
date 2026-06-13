---
"@wingleeio/mugen": patch
---

Fix `initialScroll="bottom"` when a mounted empty list shell later receives its
first rows. Empty lists can still overflow because of top/bottom slots; if that
happened, the initial bottom jump was marked complete before real rows arrived,
and `stickToBottom` could smooth-scroll the first content load. Empty-to-nonempty
now re-applies the initial bottom jump instantly.
