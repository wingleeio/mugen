---
"@wingleeio/mugen-markdown-native": minor
---

Opt-in `<MugenTextBlock>` single-native-view rendering path for `RichText`.

`setMugenTextBlockEnabled(true)` (default off) makes a whole markdown block
render as **one** native view (`@wingleeio/pretext-core`'s `MugenTextBlock`)
instead of a per-fragment `<Text>` tree — a row drops from 10–30 fibers to 1–2.
The block is built from the same pretext rich-inline walk the measure pass uses,
so painted geometry equals the measured geometry (`lines × lineHeight`); inline
boxes overlay at their reserved advances. Off by default (and a no-op unless
`@wingleeio/pretext-core`'s native view is installed), so existing behavior is
unchanged until the on-device measurements in NATIVE-TEXT.md hold.
