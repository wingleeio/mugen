---
'@wingleeio/mugen-markdown': patch
'@wingleeio/mugen-markdown-native': patch
---

Cleaner default table design — a frameless "flat hairline" look. Tables now drop the outer border/box, the header background fill, and the rounded corners, keeping only faint horizontal rules under the header and between rows. Padding is a touch airier and the header is bolder. Web and native match.

New `theme.table` defaults: `headerBackground: 'transparent'`, `radius: 0`, `borderColor: 'rgba(127,127,127,0.2)'`, `cellPadding: 12`, `headerWeight: 700`. Override any of them to bring back a framed/filled table (e.g. `radius: 8` + a `borderColor` still clips rounded corners; the row rules remain the hairline separators).
