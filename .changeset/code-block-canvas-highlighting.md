---
"@wingleeio/mugen-markdown": minor
---

Non-blocking syntax highlighting for fenced code blocks, as pure paint over the
DOM text. The `<pre><code>` renders plain text immediately and keeps owning
layout/selection/copy; a built-in line-state tokenizer (ts/js, python, rust, go,
c-family, shell, sql, css, html, json, yaml, … — extensible via
`registerLanguage`) runs in time-sliced chunks off the critical path; token
colours are painted onto viewport-lazy canvas tiles overlaying the text, and the
DOM text flips to `color: transparent` in the same frame the paint lands.
Highlighting therefore can never block first paint and can never change a
block's measured height (`lines × lineHeight + padding` stays exact), and
streaming appends re-tokenize/repaint only the changed tail. Themable via
`theme.code.highlight` (token palette, or `false` to disable) and per-block via
the `CodeBlock` `highlight` prop.
