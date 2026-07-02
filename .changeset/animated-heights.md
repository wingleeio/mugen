---
'@wingleeio/mugen': minor
---

Animated heights and row-scoped hooks.

- `Collapse`: an animated disclosure primitive. Toggling `open` tweens the row's **committed** height between 0 and the children's measured natural height — each frame re-measures the row and paints a clipped box of exactly that height, so offsets, total scroll height and paint agree mid-flight. Content that grows while open (streaming) snaps instead of animating, composing with `stickToBottom`. Honors `prefers-reduced-motion`.
- `useMugenTween(target, { duration, easing })`: an animated number for any declared dimension at the row root; retargets from the current value, driven by one shared animation clock per list.
- `useMugenRow(id)`: row-scoped hooks (`state`/`memo`/`effect`/`tween`) usable in **nested components**, where the positional hooks can't go. Resolves through the ambient session in the measure walk and a stable-identity context in the React render (the context value never changes, so it never causes context re-renders); consumers self-subscribe to their row version so they stay fresh under memo-stable ancestor elements, and keyed-slot writes bump a per-row epoch that busts the walker's element-identity height memo the same way.
