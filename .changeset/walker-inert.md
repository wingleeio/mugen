---
'@wingleeio/mugen': patch
---

The walker now ALWAYS invokes plain components under the inert dispatcher (measureElement, naturalWidthOf, isOutOfFlow). The walk is entered not only from the engine's measureRow (which installs the inert dispatcher) but also from RENDER paths — an HStack distributing widths measures its children during a real fiber render. There the live React dispatcher charged the invoked component's hooks to the rendering fiber, and because the walker's height memo skips the invocation on a cache hit, that fiber's hook count varied between renders — React's "Rendered fewer hooks than expected" crash (intermittent, cache/slotEpoch dependent). `useMugenRow` also now calls its React hooks unconditionally (no early return on the ambient path), so a fiber's hook count is constant regardless of ambient session state.
