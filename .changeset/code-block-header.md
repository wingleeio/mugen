---
"@wingleeio/mugen-markdown": minor
---

Add an optional chrome header to the fenced code block — the language on the
left, a copy-to-clipboard button on the right. Enable it through the theme with
`code.header.show` (off by default, so existing blocks are unchanged). The bar
is a fixed-height box whose height is folded into `CodeBlock`'s measured height,
so a headered block still measures exactly what it paints. The header style
(height, font size, colours, button fill) is themeable, and `CodeBlock` gains a
`header` prop plus the `CodeBlockHeader` type for direct use.
