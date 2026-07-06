---
'@wingleeio/mugen-markdown': minor
'@wingleeio/mugen-markdown-native': minor
---

Markdown tables now keep a reasonable minimum column width and scroll horizontally instead of crushing columns into per-character wrapping on narrow viewports (web and React Native).

Each column gets a max-content width and a floor of `min(max-content, theme.table.minColumnWidth)` (default `96`). Widths resolve exactly the way CSS flexbox resolves `flex-grow: max-content; flex-basis: 0` cells with a `min-width` floor: wide viewports fill proportionally as before, and once the columns' minimums no longer fit the row the table overflows into a clipped, horizontally-scrolling viewport (scrollbar hidden on web, `ScrollView` on native) whose measured height still equals what it paints. Tune the floor via `theme.table.minColumnWidth`.
