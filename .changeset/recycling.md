---
'@wingleeio/mugen-native': minor
'@wingleeio/mugen': patch
---

View recycling on React Native — the fix for hitchy scrolling on Hermes. Instead of mounting/unmounting rows at the window edges (each heavy markdown mount costs real frame time) and re-rendering the whole list every scroll frame, the native list keeps a FIXED POOL of stable-key slots and, on scroll, only reassigns WHICH row each slot shows via an external store the slots subscribe to individually. The list never re-renders on scroll; a reassigned slot REUSES its row's view tree (React reconciles new content into existing views) instead of destroying and recreating it, which for one-Text-node-per-block rows is a cheap content update. Verified: an 826-row transcript survives 26 rapid-fire flings with zero blank frames and no freezes.

Engine: notifications that fire while a row session is ambient (the measure walk, or a row's `render(item)`) are now DEFERRED until the session unwinds. A notify can make React synchronously re-render a subscribed component; mid-walk that let a nested component's `useMugenRow` take the ambient (hook-free) path where a normal render takes the React-hook path, throwing "rendered fewer hooks than expected". Deferring guarantees any such re-render sees the correct path. Also adds `scrollIndicatorInsets` to inset the drawn indicator's track below a floating header and above a composer (ChatGPT-style) while content still scrolls full-height underneath.
