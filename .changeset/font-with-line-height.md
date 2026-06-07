---
"@wingleeio/mugen": minor
---

Render text with line-height folded into the `font` shorthand
(`"16px/22px Inter"`) instead of setting `font` plus a separate `lineHeight`.
React warns ("don't mix shorthand and non-shorthand properties") whenever such
an element re-renders — which floods the console during streaming/animated rows.
The computed line-height is unchanged, so analytic heights still match the paint.
Exposes the `fontWithLineHeight(font, lineHeight)` helper for building custom
measurable primitives the same way.
