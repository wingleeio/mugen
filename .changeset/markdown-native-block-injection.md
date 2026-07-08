---
"@wingleeio/mugen-markdown-native": patch
---

`<MugenTextBlock>` is now injected by the consumer instead of dynamically
required. `setMugenTextBlock(component)` (replacing `setMugenTextBlockEnabled`)
takes the `@wingleeio/pretext-core/text-block` component directly, so this
package has no runtime dependency on pretext-core and never emits a
`require('@wingleeio/pretext-core/text-block')` — which pulled a `node:module`
`createRequire` shim into the ESM build that React Native / Metro can't bundle.
