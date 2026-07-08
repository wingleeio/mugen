---
"@wingleeio/mugen-markdown": patch
---

`parseMarkdown`: AST position offsets are now document-absolute.

incremark parses its stable and pending regions as separate micromark
documents, so the mdast `position.*.offset` values it exposes are relative to
the region text, not the document (the absolute offsets live only on its
`ParsedBlock` wrappers). Consumers that map positions back into the source
string — e.g. slicing a streamed message into per-block virtualizer rows — got
garbage after incremental appends: blocks cut mid-word at streaming chunk
boundaries, duplicated content, broken code fences. One-shot parses were also
affected on the pending (unterminated) tail block.

`parseMarkdown` now re-anchors every freshly parsed block's node subtree from
the `ParsedBlock` absolute offsets after each append. The shift is idempotent
(delta 0 once absolute), so nodes shared across cached AST snapshots stay
correct. Offsets only — `line`/`column` remain region-relative, and incremark
drops inline positions entirely; start offsets are the authoritative contract.
