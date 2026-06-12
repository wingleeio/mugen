---
"@wingleeio/mugen": minor
"@wingleeio/mugen-ui": patch
---

Add the `Escape` primitive — a fixed-size box that escapes the walker. It stays
in the row's flow at a declared `height` (border-box, pinned inline, overflow
clipped) with an optional `width` (laid out as a fixed `HStack` sibling and
reported as the natural width), but its children are **never walked** — so they
may be arbitrary non-primitive React. A complete off-the-shelf overlay — a
shadcn/ui or Radix Tooltip, Popover, DropdownMenu, or Dialog, *trigger
included* — drops straight into a row; those libraries portal their floating
content to `document.body` themselves, where mugen's layout never sees it. The
contract is `foreignObject`'s: mugen reserves exactly the box you declare, and
you design the children within it.

Deprecate `Portal` and the `@wingleeio/mugen-ui` package in its favour. Both
keep working, but the split-trigger pattern is no longer needed for overlays
with a known in-row footprint; it remains relevant only when a trigger's height
must come from measured, wrapping text. `@wingleeio/mugen-ui` will not receive
new features and will be removed in a future major.
