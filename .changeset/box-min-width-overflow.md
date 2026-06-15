---
"@wingleeio/mugen": patch
---

Fix boxes widening past their measured size when they contain an unshrinkable
wide subtree (e.g. a code block whose `<pre>` scrolls a long line). Flex items
render with the default `min-width: auto`, which floors them at their content's
min-content width — so a `VStack`/`HStack` would expand to the long line and
overflow its column instead of letting the child scroll. The measure
(`distribute`) already models proportional shrink with no such floor, so the
render now pins `min-width: 0` on every box to match: overflowing content scrolls
within the box, and the box stays at the width the walker computed. Most visible
with a code block nested in a list item, but it applies to any wide child.
