---
"@wingleeio/mugen": patch
---

Fix `stickToBottom` overpowering a slow scroll-up: the stick now breaks on any upward move and re-engages only when returning toward the bottom, instead of re-sticking whenever within the "near bottom" threshold. Touch drags that pull up before lifting near the bottom no longer snap back.
