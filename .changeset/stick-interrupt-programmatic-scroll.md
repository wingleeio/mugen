---
"@wingleeio/mugen": patch
---

Break the stick-to-bottom spring before a programmatic scroll up. `scrollToItem`/`scrollToIndex` used a bare native `scrollTo`, and the controller only released on user input — so while content streamed (and for the settle-grace window after), the spring's frame loop kept writing `scrollTop`, cancelling the smooth scroll before it moved. Clicking a minimap/rail entry during or just after a streamed reply did nothing.
