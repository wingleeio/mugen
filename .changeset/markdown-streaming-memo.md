---
"@wingleeio/mugen-markdown": minor
---

Only re-render the block being streamed. `<Markdown>` now memoizes rendered
blocks by node reference (completed blocks keep a stable element across incremark
appends, so React bails) with a content-signature fallback for sub-blocks inside
incremark's re-parsed tail — so finished list items and table cells stop
re-rendering while a later one streams in. Exposes `ctx.memo(node, variant,
build)` on the render context so custom `list`/`table` components get the same
streaming bail-out. In a long streaming turn this cut block re-renders by ~15×.
