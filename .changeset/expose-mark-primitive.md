---
"@wingleeio/mugen": minor
---

Expose `markPrimitive` (plus the `MeasureContext` and `MeasurableDef` types) so
external packages can define custom measurable primitives — a primitive with a
bespoke `measure()`, not just the tag-backed layout boxes `definePrimitive`
creates. This is the extension point `@wingleeio/mugen-markdown` builds its
rich inline-text primitive on.
