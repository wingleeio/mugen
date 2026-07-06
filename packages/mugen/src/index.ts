/**
 * mugen — virtualized React lists with analytic row heights.
 *
 * Heights come from interpreting a row's primitive tree with pretext, never
 * from measuring the DOM, so off-screen and never-mounted rows have exact
 * heights and there is no measure-on-mount layout shift.
 */

// ── The list ──
export { useMugenVirtualizer, MugenVList } from './vlist';
export type {
  UseMugenVirtualizerOptions,
  MugenVListProps,
  InitialScrollOptions,
  StickToBottomOptions,
  MugenScrollEase,
  SpringOptions,
} from './vlist';
export { MugenInstance } from './instance';
export type {
  ScrollToOptions,
  MugenScrollBehavior,
  MugenScrollAlign,
  MugenScrollState,
  MugenConfig,
  MugenHeightCache,
} from './instance';

// ── Row hooks (used inside `render`; `useMugenRow` also in nested components) ──
export { useMugenState, useMugenMemo, useMugenEffect, useMugenTween, useMugenRow } from './hooks';
export type { SetMugenState, EffectCleanup, MugenRowScope } from './hooks';
export type { MugenTweenOptions, MugenEasing } from './state/clock';

// ── Selecting list state (e.g. a scroll-to-bottom button) ──
export { useMugenSelector } from './use-mugen-selector';

// ── Primitives ──
export { Text } from './primitives/text';
export type { TextProps } from './primitives/text';
export { VStack, HStack, definePrimitive } from './primitives/box';
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
export { Portal } from './primitives/portal';
export type { PortalProps } from './primitives/portal';

// ── Defining custom measurable primitives ──
// `definePrimitive` covers tag-backed layout boxes; `markPrimitive` is the
// lower-level escape hatch for a primitive with a bespoke `measure()` (e.g. a
// rich inline-text primitive that measures mixed fonts as one wrapping flow).
export { markPrimitive, getPrimitiveDef } from './primitives/core';
export type { MeasurableDef, MeasureContext } from './primitives/core';
// `measureChildren` is the standard vertical-stack measure, exposed so a custom
// primitive can pair a bespoke render with the usual child measurement;
// `toChildArray` flattens children the same way the walker does;
// `naturalWidthOf`/`isOutOfFlow` let a custom primitive implement
// `naturalWidth` (content-based HStack distribution) over its children.
export { measureChildren, toChildArray, naturalWidthOf, isOutOfFlow } from './walker';
// Drops the element-identity height memo (the walker caches `(element, width,
// defaults, fontEpoch) -> height`); exposed for tests / memory pressure.
export { clearHeightCache } from './walker';

// ── Style + font types ──
export type { MeasurableStyle, SafeClassName } from './style';
export { fontWithLineHeight, fontLonghands } from './font';
export type { Font, FontSizeUnit, FontStyle, FontWeight } from './font';
export type { TextDefaults, WhiteSpaceMode, WordBreakMode } from './text-defaults';

// ── Advanced / escape hatches ──
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
