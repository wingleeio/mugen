---
'@wingleeio/mugen': minor
---

Add a `@wingleeio/mugen/native-core` entry: the renderer-agnostic engine
(walker, offset index, `MugenInstance`, row hooks, scroll spring, animation
clock, primitive measure halves) exported without any react-dom in its module
graph, so non-DOM renderers — `@wingleeio/mugen-native` — can build on the
exact same code. Also exports `distribute` and `resolveText` for platform
renderers. No behavior change for web consumers.
