---
"@wingleeio/mugen-markdown": minor
---

Add a `fade` prop to `<Markdown>` for streaming fade-in. With `fade`, just-arrived
text dissolves in as the source streams — the DOM still commits and lays out
instantly (heights stay exact), and a background-coloured veil over the new
characters is painted on a canvas and faded out, so the row never animates.

It's self-contained: the veil canvas lives inside the markdown's own box (out of
flow, so it adds zero measured height) and scrolls with the content — no
list-level overlay or wiring required. The painter idles until a DOM mutation
arrives, so leaving `fade` on for a settled block costs nothing, and it honours
`prefers-reduced-motion`. Interactive chrome (e.g. a code block's copy button) is
excluded from the veil's text tracking, so flipping "Copy" → "Copied" mid-stream
can't trigger a re-veil. Also exports the `FadeMarkdown` primitive for advanced use.
