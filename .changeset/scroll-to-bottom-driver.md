---
"@wingleeio/mugen": patch
---

Make `instance.scrollToBottom()` reliable on a streaming list. It now runs
through the scroll controller — springing to the bottom (for `smooth`) while
re-targeting it every frame, and re-engaging the stick — instead of a one-shot
native `scrollTo` aimed at the scroll height at call time. A native scroll
undershoots a list that grows mid-scroll, which intermittently left a
"scroll to bottom" button not actually sticking the user to the bottom.
