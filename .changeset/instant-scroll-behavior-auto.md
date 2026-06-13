---
"@wingleeio/mugen": patch
---

Force instant scroll jumps to bypass CSS `scroll-behavior: smooth`. Initial
bottom/index placement and controller jumps now temporarily set the scroll
element's inline scroll behavior to `auto` while writing `scrollTop`, then
restore the previous style so app-level smooth scrolling cannot animate an
instant initial jump.
