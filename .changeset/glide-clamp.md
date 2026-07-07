---
"@wingleeio/mugen": patch
---

`springToBottom` clamps the animated distance to 2.5 viewports — a spring's velocity scales with the remaining diff, so from tens of thousands of px it crosses thousands of px per frame, which no windowed renderer can paint and which churns the row window across regions that are never seen. From further away it teleports into glide range first (one atomic jump the list paints departure-and-destination for), then glides the rest — how chat apps' "scroll to latest" behaves from deep in history.
