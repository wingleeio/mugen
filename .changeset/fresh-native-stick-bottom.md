---
'@wingleeio/mugen-native': patch
---

Keep the native scroll adapter's geometry current before stick-to-bottom checks run. Streaming content growth could otherwise be compared against stale content height, making the controller think it was already pinned and skip the bottom correction.
