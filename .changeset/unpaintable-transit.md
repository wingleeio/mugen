---
"@wingleeio/mugen-native": patch
---

Heavy-session fling overhaul — three fixes measured on a 100k-px transcript:

- **Height-budgeted rebinds.** The per-event fresh-bind budget is now measured in content height (pretext gives every row height analytically), not row count. A count budget let one scroll event batch several very heavy rows into a single multi-hundred-ms React commit, which starved scroll events and blanked the whole transit.
- **Landing-first regime at unpaintable speeds.** Once the viewport turns over faster than a bind can reach the screen (extreme chained momentum), near-field binding is provably wasted; assignment priority flips to the projected fling landing so the destination is painted when deceleration becomes readable. At bindable speeds near-field-first is unchanged.
- **Settle drain.** A budget-starved allocate now schedules a follow-up pass; previously a scroll that settled before its window was bound had no further events to finish the job and the screen stayed bare until the next input. Also: velocity samples closer than half a frame (queue drains after a JS stall) are rejected and the estimate is clamped — coalesced events used to read as millions of px/s and poison every velocity-gated decision.
