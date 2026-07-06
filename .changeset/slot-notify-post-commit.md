---
'@wingleeio/mugen-native': patch
---

Render-phase slot reassignments now deliver their notifications AFTER the commit (a layout effect wakes exactly the changed slots) instead of synchronously during `MugenVList`'s render — which was a cross-component setState-in-render (React: "Cannot update a component (`Slot`) while rendering a different component (`MugenVList`)"). Same-frame delivery, no visual change; onScroll reassignments still notify immediately (event handlers are legal).
