---
"@wingleeio/mugen-ui": patch
---

Overlay primitives now report their content width to mugen's content-based
`HStack` distribution: `Trigger`/Root expose `naturalWidth` (the trigger
renders `width: fit-content`, so its flex-item width is its widest child) and
`Content` is flagged out-of-flow — rows mixing triggers with text no longer
fall back to an equal width split that mis-measured their height.
