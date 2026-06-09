---
"@wingleeio/mugen-ui": minor
---

Initial release of `@wingleeio/mugen-ui`: measurable overlay primitives for
mugen — `Tooltip`, `Popover`, `Dropdown`, and `Dialog`.

Each is a compound component (`<Tooltip>` / `<Tooltip.Trigger>` /
`<Tooltip.Content>`, and likewise for the others). The **trigger** is registered
as a mugen primitive, so the virtualizer's walker measures it like any other
content and it contributes its real height to the row. The **content** lives in
mugen's `Portal` — measured as 0 and never walked — so the popover/menu/dialog
can be arbitrary React (hooks, portals) and never re-flows the list when it
opens. Because the trigger is measured for real (no parallel "measure"
description), a row's height can't desync from what paints.

Positioning (anchored, viewport-clamped, repositioned on scroll/resize),
dismissal (Escape + outside press), focus management (dialog focus trap-in /
restore-out), and keyboard navigation (dropdown arrow/Home/End roving focus) are
all handled here, with self-contained positioning and no extra dependencies —
mugen core stays a pure measurement engine.
