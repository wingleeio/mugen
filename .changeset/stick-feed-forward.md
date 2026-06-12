---
"@wingleeio/mugen": patch
---

Keep the streaming tail above the fold while stuck to the bottom. The spring is
a proportional controller, so continuously growing content left it trailing the
bottom by ~11× the per-frame growth rate — 50–120px during fast streaming,
enough to clip the trailing caret below the fold. The controller now estimates
the content growth rate (EMA) and feeds it forward into the position step, with
the spring handling only the residual at its stock gains, riding a rate-scaled
buffer (~a wrapped line) behind the bottom so velocity stays continuous instead
of stair-stepping against discrete line wraps. Measured during the AI-chat
stream: median distance from bottom drops 47px → 13px with no loss of
frame-rate-independent smoothness; the list still settles flush when the stream
ends.
