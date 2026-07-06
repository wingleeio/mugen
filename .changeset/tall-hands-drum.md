---
'@wingleeio/mugen-native': minor
---

`MugenVList` passes `keyboardDismissMode` and `keyboardShouldPersistTaps` through to its ScrollView. Chat UIs put a composer under the list; without `keyboardDismissMode="interactive"` the keyboard can't be dragged away, and without `keyboardShouldPersistTaps` the first tap on a row only dismisses the keyboard.
