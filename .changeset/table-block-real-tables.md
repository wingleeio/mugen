---
"@wingleeio/mugen-markdown": minor
---

GFM tables now render as actual tables via a new `TableBlock` primitive.
Columns share one set of widths across all rows — proportional to each
column's max-content width (cells paint as `flex: ratio ratio 0`, and the
measure runs the identical arithmetic, so heights stay exact at any width) —
instead of each row flexing independently and misaligning. Visual chrome is
height-neutral: hairline row dividers are real `theme.table.gap`-px elements,
the outer ring is an inset box-shadow, and the corner radius is overflow
clipping. New theme knobs: `table.borderColor` and `table.radius`.
