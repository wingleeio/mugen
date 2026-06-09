---
"@wingleeio/mugen": patch
---

Read a fixed `width` through composed components when distributing `HStack`
width. A plain component whose root primitive declares `width` (an icon, an
avatar) renders as a `flex: 0 0 width` item in the DOM, but the measure pass
treated it as a grow child and split the row equally — wrapping siblings at a
width the DOM never uses. On mobile widths this overestimated row heights
(visible as growing empty space under a streaming chat row with tool cards).
