---
"@wingleeio/mugen": patch
---

Fix `stickToBottom` over-triggering. Auto-scroll now fires only when the content actually grows (matching use-stick-to-bottom's resize-driven model) instead of on every render, so it no longer yanks you to the bottom when you're merely near it with static content. The stick also re-engages only on a real downward move, so a slow scroll-up reliably escapes instead of re-sticking between its own steps.
