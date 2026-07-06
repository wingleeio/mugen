---
'@wingleeio/mugen-native': minor
'@wingleeio/mugen-markdown-native': minor
---

One native Text node per BLOCK, not per wrapped line. The native `Text` and `RichText` primitives materialized pretext's line breaks as one absolutely-positioned `<Text>` **per line** — so a 10-line paragraph was ~10 Fabric nodes versus the web's single node. Mounting a screenful of markdown was ~10× the view-creation cost of the web, which is what a fast fling outran into blank canvas. Now each block joins its lines at pretext's break points with hard `\n` into a single `<Text>` capped at the measured line count (`numberOfLines`), so height stays exact (a sub-pixel shaper disagreement clips instead of reflowing) and per-row mount cost matches the web. `RichText` collapses only runs of consecutive single-fragment, same-style lines (plain paragraphs — the common case); lines with inline marks, links, or an active streaming fade keep their per-fragment nodes.
