---
'@wingleeio/mugen-native': patch
---

Flicker-free scroll anchoring on React Native. The web applies anchor shifts post-commit pre-paint; on RN an imperative scrollTo lands a frame late (one-frame flash of the wrong content on every history prepend), and a `contentOffset` prop update is applied by Fabric BEFORE the content grows, so iOS clamps it to the old max and the viewport silently drifts. Anchoring is now a two-commit choreography, each frame pixel-identical: the taller content commits with a counter-translation of the canvas, the corrective scroll dispatches, and its own onScroll drops the translation. Also seeds `initialScroll` through the mount-time `contentOffset` (the one moment Fabric honors it), windowing the first measure at the anchor.
