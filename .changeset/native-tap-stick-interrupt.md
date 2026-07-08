---
'@wingleeio/mugen-native': patch
---

Stop the stick-to-bottom spring at finger-down (onTouchStart), not just drag-begin. A tap never becomes a drag, so while the spring was warm (streaming + settle grace) its per-frame scrollTo writes moved content under the finger and iOS canceled the child press — collapse toggles and other row controls ignored taps until a drag stopped the spring. Mirrors the web host's touchstart/touchend wiring; onTouchCancel closes out the pointer when a recognized drag cancels the JS touch.
