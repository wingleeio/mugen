---
"@wingleeio/mugen": patch
---

Fix reused-route initial scrolling when a list changes from default top
placement to `initialScroll="bottom"`. The list now treats a changed
`initialScroll` target as a fresh initial-scroll request, so navigating from a
main page into a chat page jumps to the chat bottom instantly instead of staying
at top or letting `stickToBottom` perform the first move.
