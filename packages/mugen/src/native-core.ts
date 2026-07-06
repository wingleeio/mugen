/**
 * mugen/native-core — the renderer-agnostic core, for non-DOM ports.
 *
 * Everything exported here is pure logic or React-only (no react-dom, no
 * document/window at module scope): the walker, the Fenwick offset index, the
 * engine (`MugenInstance`), row hooks, the stick-to-bottom spring math, the
 * animation clock, and the primitives' *measure* halves (reachable via
 * `getPrimitiveDef(Text).measure` etc. — their render halves emit DOM and are
 * replaced by the platform renderer).
 *
 * `@wingleeio/mugen-native` builds the React Native renderer on top of this
 * entry. The main `.` entry is NOT imported so Metro never has to resolve
 * react-dom (only `Portal`, deprecated, touches it).
 *
 * This subpath is semver-exempt plumbing for first-party renderers; app code
 * should import from `@wingleeio/mugen` (web) or `@wingleeio/mugen-native`.
 */

// ── Engine ──
export { MugenInstance } from './instance';
export type {
  ScrollToOptions,
  MugenScrollBehavior,
  MugenScrollAlign,
  MugenScrollState,
  MugenConfig,
  MugenHeightCache,
} from './instance';

// ── Height interpretation (the walker) ──
export {
  heightOf,
  measureNode,
  measureChildren,
  toChildArray,
  naturalWidthOf,
  isOutOfFlow,
  clearHeightCache,
} from './walker';

// ── Offset index (Fenwick tree over row heights) ──
export { OffsetIndex } from './offset/offset-index';

// ── Row hooks + selector ──
export { useMugenState, useMugenMemo, useMugenEffect, useMugenTween, useMugenRow } from './hooks';
export type { SetMugenState, EffectCleanup, MugenRowScope } from './hooks';
export { useMugenSelector } from './use-mugen-selector';

// ── Session plumbing (ambient measure/render passes) ──
export { currentSession, withSession, requireSession, requireRootSession } from './session';
export type { SlotHost, SessionMode, SessionPhase, MugenSession } from './session';
export { RowScopeContext } from './row-scope';
export type { RowScopeRef } from './row-scope';

// ── Primitive definitions (measure halves) ──
export { markPrimitive, getPrimitiveDef } from './primitives/core';
export type { MeasurableDef, MeasureContext } from './primitives/core';
export { Text, resolveText } from './primitives/text';
export type { TextProps, ResolvedText } from './primitives/text';
export { VStack, HStack, definePrimitive, distribute } from './primitives/box';
export type {
  BoxProps,
  BoxLayoutProps,
  BoxDirection,
  VStackProps,
  HStackProps,
  PrimitiveComponent,
  DefinePrimitiveOptions,
} from './primitives/box';
export { Escape } from './primitives/escape';
export type { EscapeProps } from './primitives/escape';
export { Collapse } from './primitives/collapse';
export type { CollapseProps } from './primitives/collapse';

// ── Scroll spring (stick-to-bottom + initial scroll) ──
export {
  ScrollController,
  setScrollTopInstant,
  DEFAULT_SPRING,
  STICK_THRESHOLD_PX,
} from './scroll-controller';
export type { MugenScrollEase, SpringOptions } from './scroll-controller';

// ── Animation clock (tweens, Collapse) ──
export {
  AnimationClock,
  resolveEasing,
  prefersReducedMotion,
  resetReducedMotionCache,
  canAnimate,
  DEFAULT_TWEEN_MS,
} from './state/clock';
export type { MugenEasing, MugenTweenOptions, TweenState } from './state/clock';

// ── Text measurement (pretext seam) ──
export {
  prepareText,
  prepareTextSegments,
  measureText,
  textHeight,
  naturalWidth,
  clearTextCache,
  assertMeasurableFont,
} from './pretext/measure';
export type { TextMetrics, PrepareOptions, PreparedText } from './pretext/measure';
export { watchFonts, subscribeFonts, fontEpoch, notifyFontsChanged } from './pretext/fonts';

// ── Style + font helpers ──
export type { MeasurableStyle, SafeClassName } from './style';
export { fontWithLineHeight, fontLonghands } from './font';
export type { Font, FontSizeUnit, FontStyle, FontWeight } from './font';
export { TextDefaultsContext } from './text-defaults';
export type { TextDefaults, WhiteSpaceMode, WordBreakMode } from './text-defaults';

// ── Width tokens (max-width resolution) ──
export { rootFontSizePx, resolveMaxWidthPx, contentWidth } from './tokens-resolve';
export type { MaxWidth } from './tokens-resolve';
