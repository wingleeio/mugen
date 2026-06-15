---
"@wingleeio/mugen-markdown": minor
---

Add measured **inline boxes** and an **inline-override API** — the pieces needed
for custom inline content (citation pills, mentions, icons, badges) that wraps
with the text yet keeps heights exact.

- `RichTextRun` gains an inline-box variant: `{ advance, content }`. It's the
  inline twin of mugen's `Escape` — it reserves exactly `advance` px in the flow
  (backed by pretext's `extraWidth`) and paints arbitrary `content` without
  measuring its insides, wrapping as one non-breaking atom. The veil canvas adds
  zero measured height; the box's own height is paint-only.
- `defineMarkdownComponents({ inline: { ... } })` overrides how an inline node
  (`link`, `strong`, `emphasis`, `inlineCode`, `text`, or a custom token via the
  index signature) flattens into runs — return your own runs (text and/or boxes)
  or `null` to fall back to the default. The override receives an
  `InlineRenderContext` with `fmt`, `font()`, `measure(text, font)`, and
  `runs()` for composing.
- Exports `measureInline(text, font)` so callers can size a text box exactly
  (e.g. a pill is `measureInline(label, font) + paddingX`), plus the
  `FadeMarkdown` and `InlineComponents`/`InlineComponent`/`InlineRenderContext`
  types.

Caveat: a box splits the inline flow, so the spaces around it are measured as
inter-item gaps (like inline code or links). That carries pretext's sub-pixel
gap rounding, which at an exact wrap boundary can shift a line — keep box widths
deterministic and you'll only ever see it at a knife-edge width.
