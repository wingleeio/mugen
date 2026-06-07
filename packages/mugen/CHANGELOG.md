# @wingleeio/mugen

## 0.2.2

### Patch Changes

- [`d6d40ea`](https://github.com/wingleeio/mugen/commit/d6d40eadbc6b1bf385dd5005a80ea016d42c156e) Thanks [@wingleeio](https://github.com/wingleeio)! - Fix `stickToBottom` over-triggering. Auto-scroll now fires only when the content actually grows (matching use-stick-to-bottom's resize-driven model) instead of on every render, so it no longer yanks you to the bottom when you're merely near it with static content. The stick also re-engages only on a real downward move, so a slow scroll-up reliably escapes instead of re-sticking between its own steps.

## 0.2.1

### Patch Changes

- [`d53d0f1`](https://github.com/wingleeio/mugen/commit/d53d0f150dca26717123d60f034e62993e018214) Thanks [@wingleeio](https://github.com/wingleeio)! - Fix `stickToBottom` overpowering a slow scroll-up: the stick now breaks on any upward move and re-engages only when returning toward the bottom, instead of re-sticking whenever within the "near bottom" threshold. Touch drags that pull up before lifting near the bottom no longer snap back.

## 0.2.0

### Minor Changes

- [`804996d`](https://github.com/wingleeio/mugen/commit/804996df231cabe1b52ec6b454f98c05206ef129) Thanks [@wingleeio](https://github.com/wingleeio)! - Add `useMugenSelector` for subscribing to the list's scroll state and rendering from a derived slice (Zustand/Redux-style), so a component re-renders only when the selected value changes. Also exposes `MugenInstance.getScrollState()`, `setScrollTop()`, and `scrollToBottom()`, and the `MugenScrollState` type — enough to build a floating scroll-to-bottom button that reacts to scroll position.

## 0.1.0

### Minor Changes

- [`4ada87c`](https://github.com/wingleeio/mugen/commit/4ada87c38c119d242cab63f349587e534fd744e5) Thanks [@wingleeio](https://github.com/wingleeio)! - Initial public release.
