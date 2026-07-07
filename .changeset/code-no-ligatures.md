---
'@wingleeio/mugen-markdown': patch
'@wingleeio/mugen-markdown-native': patch
---

Code now renders literal characters instead of programming ligatures. A monospace font's `===`, `!=`, `>=`, `=>`, `->` etc. were being drawn as combined ligature glyphs in code blocks and inline code, which is misleading when reading code.

Fenced code and inline `code` now disable ligatures across every paint path — the web `<pre>`/`<code>` and inline spans (`font-variant-ligatures: none`), the canvas syntax-highlight overlay (`textRendering: optimizeSpeed`), and React Native `Text` (`fontVariant: no-common-ligatures/no-contextual/…`). Body prose keeps its ligatures. This is height-neutral: monospace advances don't change under ligature substitution, so measured heights are unaffected.
