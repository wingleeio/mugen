/**
 * mugen-native — virtualized React Native lists with analytic row heights.
 *
 * The same engine as `@wingleeio/mugen` (walker, Fenwick offset index, slots,
 * scroll spring — imported, not forked), with a React Native renderer on top:
 * rows are absolutely-positioned Views in a ScrollView, and `Text` paints the
 * exact lines pretext measured (per-line materialization), so heights can't
 * disagree with paint even though RN's native line breaker differs from the
 * web's. Text metrics come from `@wingleeio/pretext-native`, which reads glyph
 * advances straight out of the app's bundled font files — no canvas, no DOM.
 *
 * Setup: call `configureMugenNative({ fonts: [...] })` at startup.
 */

// ── Setup ──
export { configureMugenNative } from './setup';
export type { ConfigureMugenNativeOptions } from './setup';
export {
  setFontFaceResolver,
  fontShorthandToTextStyle,
  clearFontStyleCache,
} from './font-style';
export type { FontFaceResolver, FontFaceRequest } from './font-style';

// ── The list ──
export { useMugenVirtualizer, MugenVList, CANVAS_HEADROOM } from './vlist';
export type {
  UseMugenVirtualizerOptions,
  MugenVListProps,
  InitialScrollOptions,
  StickToBottomOptions,
  MugenScrollEase,
  SpringOptions,
} from './vlist';

// ── The shared engine (identical to the web) ──
export { MugenInstance } from '@wingleeio/mugen/native-core';
export type {
  ScrollToOptions,
  MugenScrollBehavior,
  MugenScrollAlign,
  MugenScrollState,
  MugenConfig,
} from '@wingleeio/mugen/native-core';

// ── Row hooks (used inside `render`; `useMugenRow` also in nested components) ──
export {
  useMugenState,
  useMugenMemo,
  useMugenEffect,
  useMugenTween,
  useMugenRow,
  useMugenSelector,
} from '@wingleeio/mugen/native-core';
export type {
  SetMugenState,
  EffectCleanup,
  MugenRowScope,
  MugenTweenOptions,
  MugenEasing,
} from '@wingleeio/mugen/native-core';

// ── Primitives (native render halves, shared measure halves) ──
export { Text } from './primitives/text';
export type { TextProps } from './primitives/text';
export { VStack, HStack, definePrimitive } from './primitives/box';
export type {
  NativeBoxProps,
  VStackProps,
  HStackProps,
  NativePrimitiveComponent,
  DefineNativePrimitiveOptions,
} from './primitives/box';
export { Escape } from './primitives/escape';
export type { EscapeProps } from './primitives/escape';
export { Overlay } from './primitives/overlay';
export type { OverlayProps } from './primitives/overlay';
export { Collapse } from './primitives/collapse';
export type { CollapseProps } from './primitives/collapse';

// ── Width threading (custom native primitives read this to paint text lines) ──
export { WidthContext } from './width-context';

// ── Defining custom measurable primitives ──
export {
  markPrimitive,
  getPrimitiveDef,
  measureChildren,
  toChildArray,
  naturalWidthOf,
  isOutOfFlow,
  clearHeightCache,
} from '@wingleeio/mugen/native-core';
export type { MeasurableDef, MeasureContext } from '@wingleeio/mugen/native-core';

// ── Font types + text measurement escape hatches (shared with the web) ──
export { fontWithLineHeight, fontLonghands } from '@wingleeio/mugen/native-core';
export type {
  Font,
  FontSizeUnit,
  FontStyle,
  FontWeight,
  TextDefaults,
  WhiteSpaceMode,
  WordBreakMode,
} from '@wingleeio/mugen/native-core';
export {
  prepareText,
  prepareTextSegments,
  measureText,
  textHeight,
  naturalWidth,
  clearTextCache,
  assertMeasurableFont,
  subscribeFonts,
  fontEpoch,
  notifyFontsChanged,
} from '@wingleeio/mugen/native-core';
export type { TextMetrics, PrepareOptions, PreparedText } from '@wingleeio/mugen/native-core';

// ── Measurement backend re-exports (register fonts, tune the engine) ──
export {
  registerFont,
  clearRegisteredFonts,
  getRegisteredFonts,
  setGenericFontFamily,
  installPretextPolyfills,
  measureTextWidth,
} from '@wingleeio/pretext-native';
export type { RegisterFontOptions } from '@wingleeio/pretext-native';
