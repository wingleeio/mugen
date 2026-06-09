---
"@wingleeio/mugen": patch
---

Don't let an upward wheel break `stickToBottom` while the list doesn't overflow
yet. On a short list nothing can scroll, so no scroll event would ever fire to
re-engage the stick — a stray wheel-up before the content outgrew the viewport
silently disabled sticking for the rest of the session.
