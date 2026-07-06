---
'@wingleeio/mugen-native': patch
---

`MugenVList` resolves `initialScroll` during the first render when the viewport is controlled (`width` + `height`), seeding the row window at the anchor and handing the offset to the ScrollView as its mount-time `contentOffset`. The previous imperative scrollTo raced the native content layout: the viewport could be stranded past the content (blank list, rows at negative y), and the first measure paid for the top-of-list window it was about to jump away from.
