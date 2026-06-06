---
"@wingleeio/mugen": minor
---

Add `useMugenSelector` for subscribing to the list's scroll state and rendering from a derived slice (Zustand/Redux-style), so a component re-renders only when the selected value changes. Also exposes `MugenInstance.getScrollState()`, `setScrollTop()`, and `scrollToBottom()`, and the `MugenScrollState` type — enough to build a floating scroll-to-bottom button that reacts to scroll position.
