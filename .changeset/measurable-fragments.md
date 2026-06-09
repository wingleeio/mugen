---
"@wingleeio/mugen": patch
---

Allow React Fragments (`<>…</>`) in a row's tree. A Fragment paints no box, so
the walker now treats it as transparent — splicing its children in place and
measuring them as ordinary siblings — instead of throwing "not a measurable
primitive". Fragment children are flattened in `toChildArray` too, so box chrome
(gaps, `HStack` width distribution) counts the real children and the analytic
height matches the render.
