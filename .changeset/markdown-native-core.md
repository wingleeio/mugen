---
'@wingleeio/mugen-markdown': minor
---

Add a `@wingleeio/mugen-markdown/native-core` entry (the renderer-agnostic
pipeline — parsing, theme, dispatcher, tokenizer, primitive measure halves —
with no react-dom in its module graph) and a `primitives` option on
`renderMarkdown` so non-DOM renderers can inject their own `Stack`/`RichText`.
Runtime imports now come from `@wingleeio/mugen/native-core` (same modules,
react-dom-free), so the peer range floor moves to mugen 0.5. No behavior
change for web consumers.
