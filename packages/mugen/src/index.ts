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
} from './instance';

// ── Row hooks (used inside `render`) ──
export { useMugenState, useMugenMemo, useMugenEffect } from './hooks';
export type { SetMugenState, EffectCleanup } from './hooks';

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
// `toChildArray` flattens children the same way the walker does.
export { measureChildren, toChildArray } from './walker';

// ── Style + font types ──
export type { MeasurableStyle, SafeClassName } from './style';
export { fontWithLineHeight } from './font';
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
