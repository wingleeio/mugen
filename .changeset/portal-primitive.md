---
"@wingleeio/mugen": minor
---

Add the `Portal` primitive — the sanctioned way to put out-of-flow content
(a tooltip popover, dropdown menu, dialog panel) in a row. Its `measure()`
returns 0 *without recursing*, so the subtree inside is never walked and may be
arbitrary non-primitive React (a Radix/floating-ui overlay), while the trigger
that anchors it stays in the row and is measured normally. Renders its children
portaled to `document.body` by default (`container` overridable; `null` renders
inline for self-positioned content).

Also expose `measureChildren` (the standard vertical-stack measure) and
`toChildArray`, so a custom primitive can pair a bespoke hook-using render with
the usual child measurement. Adds `react-dom` as a peer dependency.
