---
"@wingleeio/mugen-markdown": minor
---

Initial release of `@wingleeio/mugen-markdown`: measurable markdown for mugen.

Markdown is parsed with [incremark](https://www.incremark.com/) into an mdast
tree and rendered entirely with mugen primitives, so the virtualizer's tree
walker computes exact row heights (off-screen and never-mounted rows included).
Inline rich text — mixed bold/italic/code/link runs in one wrapping flow — is
measured by a new `RichText` primitive backed by `@chenglou/pretext`'s
rich-inline layout, validated against the real DOM by a browser accuracy gate.
Block-level nodes are overridable through a fully-typed `components` map and a
deep-partial `theme`, both authored from the same primitives.

Parsing is incremental automatically: when a row's `source` grows (streaming LLM
output), only the new text is appended to a retained incremark parser, so a
streaming message stays `O(delta)` per tick rather than re-parsing the whole
prefix — while static rows are served from a parse cache.
