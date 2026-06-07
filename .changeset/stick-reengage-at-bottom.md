---
"@wingleeio/mugen": patch
---

Re-engage `stickToBottom` whenever a scroll lands at the bottom, not only on an
explicit downward move. If the user had scrolled up (escaping the stick) and then
the content shrank back to the bottom — e.g. pressing a "replay"/"regenerate"
button that resets the streaming row — the clamp left them pinned at the bottom
but with a stale escape, so the new stream played below the fold without
sticking. Landing at the bottom now clears the escape; a real scroll-up still
moves past the bottom threshold before any such event, so it isn't swallowed.
