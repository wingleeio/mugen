---
"@wingleeio/mugen": minor
---

Measure `HStack` width distribution the way flexbox paints it. Unfixed children
take their **content** width (matching the rendered `flex: 0 1 auto`) and
shrink proportionally on overflow, instead of an equal split the DOM never
performs — which wrapped text in the measure pass that paints on one line and
inflated row heights (most visibly on mobile widths). `MeasurableDef` gains an
optional `naturalWidth(props, ctx)` for custom primitives (implemented for
`Text` and all boxes; rows containing a primitive without it fall back to the
equal split), plus an `outOfFlow` flag so `Portal` no longer consumes a width
share or a gap it never paints. New exports: `naturalWidthOf`, `isOutOfFlow`.

Boxes also now neutralize UA styles the walker can't see (`margin`, `border`,
default `padding`, `content-box` sizing on tags like `blockquote`/`button`),
and `Text` pins ligatures/letter-spacing inline so page CSS (e.g. a global
`code { font-feature-settings: 'liga' 0 }`) can't change glyph widths under
measured text.
