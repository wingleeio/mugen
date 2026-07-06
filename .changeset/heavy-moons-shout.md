---
'@wingleeio/pretext-native': patch
---

Backfill `navigator.userAgent` with an empty string when `navigator` exists without one (React Native/Hermes ships `{ product: 'ReactNative' }`). pretext's engine-profile sniff only guards `typeof navigator === 'undefined'` before calling `userAgent.includes(...)`, so the first measurement on React Native crashed with "Cannot read property 'includes' of undefined". The empty UA lands pretext on the neutral engine profile — correct for the font-table ruler, which has no browser line-breaker quirks to model.
