---
"@wingleeio/mugen": minor
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

Deprecate `Portal` in its favour. It keeps working, but a separate
measured-as-0 out-of-flow half is no longer needed for overlays with a known
in-row footprint — the whole widget, trigger included, lives inside an
`Escape`.
