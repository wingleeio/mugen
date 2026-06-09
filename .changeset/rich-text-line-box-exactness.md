---
"@wingleeio/mugen-markdown": patch
---

Make every rendered line box exactly `lineHeight` tall so painted heights equal
`lines × lineHeight`: the `RichText` container now carries the flow's base font
(a smaller inherited page font built a strut on a different baseline, stretching
heading lines ~6px), runs render with zero leading so a mixed-font run (inline
code) can't grow its line ~0.5px past `lineHeight`, and runs pin
ligatures/letter-spacing against page CSS. The blockquote rule is painted with
an inset `box-shadow` instead of a border (which consumed content width the
walker couldn't see), `RichText` implements `naturalWidth` so table cells
distribute like the painted flexbox, and a real-document browser accuracy gate
asserts per-block computed === DOM exactly.
