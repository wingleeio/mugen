---
'@wingleeio/mugen-markdown-native': patch
---

`@wingleeio/mugen-native` moved from dependencies to peerDependencies (>=0.2.0). As a regular dependency, a consumer upgrading mugen-native past the pinned range got a SECOND nested copy — and module state (the font registry) split between them, silently rendering markdown text blank. A peer guarantees exactly one copy in the app graph.
