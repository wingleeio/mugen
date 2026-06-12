---
"@wingleeio/mugen": patch
"@wingleeio/mugen-markdown": patch
---

Render text with font longhands instead of the `font` shorthand. Mixing the
shorthand with the pinned shaping longhands (`fontFeatureSettings`,
`fontVariantLigatures`) made React warn on every re-render while streaming.
`Text` and `RichText` now expand the measurable font shape into
`fontStyle`/`fontWeight`/`fontSize`/`lineHeight`/`fontFamily` (with
`fontStretch` pinned to `normal`), painting identically — verified by the
browser paint-parity suites. The helper is exported as `fontLonghands`.
