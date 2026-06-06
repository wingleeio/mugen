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
  MugenConfig,
} from './instance';

// ── Row hooks (used inside `render`) ──
export { useMugenState, useMugenMemo, useMugenEffect } from './hooks';
export type { SetMugenState, EffectCleanup } from './hooks';

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

// ── Style + font types ──
export type { MeasurableStyle, SafeClassName } from './style';
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
