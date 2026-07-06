import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  ScrollView,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  MugenInstance,
  RowScopeContext,
  withSession,
  TextDefaultsContext,
  ScrollController,
  DEFAULT_SPRING,
  STICK_THRESHOLD_PX,
  setScrollTopInstant,
  fontEpoch,
  subscribeFonts,
  type MugenSession,
  type TextDefaults,
  type Font,
  type WhiteSpaceMode,
  type WordBreakMode,
  type MugenScrollAlign,
  type MugenScrollEase,
  type SpringOptions,
} from '@wingleeio/mugen/native-core';
import { NativeScrollElement } from './scroll-adapter';
import { WidthContext } from './width-context';

export type { MugenScrollEase, SpringOptions };

/** Where the list sits on first measure, and how it gets there. */
export type InitialScrollOptions =
  | {
      to: 'top' | 'bottom';
      /** `'instant'` (default) jumps; `'smooth'` springs into place. */
      behavior?: MugenScrollEase;
    }
  | {
      to: 'index';
      index: number;
      /** Where the row lands in the viewport. Default `start`. */
      align?: Exclude<MugenScrollAlign, 'auto'>;
      /** `'instant'` (default) jumps; `'smooth'` uses the platform's animated scroll. */
      behavior?: MugenScrollEase;
    };

/** Keep the list pinned to the bottom as content grows (chat streaming). */
export interface StickToBottomOptions extends Partial<SpringOptions> {
  /** `'smooth'` (default) springs; `'instant'` snaps each growth. */
  behavior?: MugenScrollEase;
  /** Px from the bottom still treated as "stuck". Default 70. */
  threshold?: number;
}

export interface UseMugenVirtualizerOptions<T> {
  /** The data. New array identity triggers a re-key + re-measure. */
  items: T[];
}

/**
 * Create (and own, across renders) a list instance for `items` — the shared
 * mugen engine, identical to the web. Pass the returned instance to
 * `<MugenVList>`; call `instance.scrollToItem(key)` to scroll.
 */
export function useMugenVirtualizer<T>(options: UseMugenVirtualizerOptions<T>): MugenInstance<T> {
  const ref = useRef<MugenInstance<T> | null>(null);
  if (ref.current === null) ref.current = new MugenInstance<T>();
  ref.current.setItems(options.items);
  return ref.current;
}

export interface MugenVListProps<T> {
  /** The instance from `useMugenVirtualizer`. */
  instance: MugenInstance<T>;
  /** Stable key per item — drives identity, slot state, and offset patching. */
  getKey: (item: T, index: number) => string;
  /** Author a row as a primitive tree; the mugen hooks may be used inside. */
  render: (item: T) => ReactNode;
  /** Scrollable content rendered before the first row (loading older pages, headers). */
  renderTop?: () => ReactNode;
  /** Scrollable content rendered after the last row (loading newer pages, footers). */
  renderBottom?: () => ReactNode;

  // ── Text defaults (a <Text> inherits these unless it sets its own) ──
  font?: Font;
  lineHeight?: number;
  letterSpacing?: number;
  whiteSpace?: WhiteSpaceMode;
  wordBreak?: WordBreakMode;

  // ── Layout ──
  /** Max content width — px number, a rem string (`"48rem"`), or a named size. */
  maxW?: number | string;
  /** Viewport height in px. Defaults to filling the parent (`flex: 1`). */
  height?: number;
  /** Where to place the scroll on first measure. Applied once. */
  initialScroll?: 'top' | 'bottom' | InitialScrollOptions;
  /** Keep the list pinned to the bottom as content grows — for streaming chat. */
  stickToBottom?: boolean | StickToBottomOptions;
  /** Override the measured viewport width (tests); skips onLayout. */
  width?: number;
  /** Extra px rendered above/below the viewport. Default 200. */
  overscan?: number;
  /** Called once each time the scroll position enters the top threshold. */
  onTopReached?: (index: number) => void;
  /** Called once each time the scroll position enters the bottom threshold. */
  onBottomReached?: (index: number) => void;
  /** Px from the top that counts as reached. Default 0. */
  topReachedThreshold?: number;
  /** Px from the bottom that counts as reached. Default 0. */
  bottomReachedThreshold?: number;

  // ── Keyboard (chat composers live below lists; pass through to ScrollView) ──
  /** How drags dismiss the keyboard. RN's default is `'none'`; chat UIs want `'interactive'`. */
  keyboardDismissMode?: 'none' | 'on-drag' | 'interactive';
  /** Whether taps land on children while the keyboard is up. */
  keyboardShouldPersistTaps?: 'always' | 'never' | 'handled';
  style?: StyleProp<ViewStyle>;
}

// One memoized row wrapper — re-renders only when its own props change or its
// slot state changes (it subscribes to its row version). Identical logic to the
// web RowView; only the host elements differ.
const RowView = memo(function RowView<T>(props: {
  instance: MugenInstance<T>;
  rowKey: string;
  item: T;
  top: number;
  cw: number;
  centered: boolean;
}): ReactElement {
  const { instance, rowKey, item, top, cw, centered } = props;

  const subscribe = useCallback(
    (cb: () => void) => instance.subscribeRow(rowKey, cb),
    [instance, rowKey],
  );
  const getVersion = useCallback(() => instance.rowVersion(rowKey), [instance, rowKey]);
  useSyncExternalStore(subscribe, getVersion, getVersion);

  const session: MugenSession = {
    host: instance as unknown as MugenSession['host'],
    rowKey,
    mode: 'render',
    phase: 'root',
    hookIndex: { current: 0 },
  };
  const tree = withSession(session, () => instance.renderRow(item));

  return (
    <View
      style={{
        position: 'absolute',
        top,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: centered ? 'center' : 'flex-start',
      }}
    >
      <View style={{ width: cw }}>
        <WidthContext.Provider value={cw}>
          <RowScopeContext.Provider value={instance.scopeRef(rowKey)}>
            {tree}
          </RowScopeContext.Provider>
        </WidthContext.Provider>
      </View>
    </View>
  );
}) as <T>(props: {
  instance: MugenInstance<T>;
  rowKey: string;
  item: T;
  top: number;
  cw: number;
  centered: boolean;
}) => ReactElement;

/**
 * The list component — a React Native `ScrollView` wearing the web `MugenVList`
 * brain. Windowing math, scroll anchoring, stick-to-bottom spring, initial
 * scroll and reach callbacks are the shared engine, driven through a
 * `NativeScrollElement` adapter; viewport size comes from `onLayout` instead
 * of a ResizeObserver, and stick interrupts from drag gestures instead of
 * wheel events.
 */
export function MugenVList<T>(props: MugenVListProps<T>): ReactElement {
  const { instance, getKey, render } = props;
  const scrollViewRef = useRef<ScrollView | null>(null);
  const adapterRef = useRef<NativeScrollElement | null>(null);
  if (adapterRef.current === null) adapterRef.current = new NativeScrollElement();
  const adapter = adapterRef.current;
  const el = adapter as unknown as HTMLElement;
  const [scrollTop, setScrollTop] = useState(0);
  const measured = useRef<{ width: number; height: number }>({ width: 0, height: 0 });

  // Re-render whenever any row is invalidated.
  const subscribeGlobal = useCallback((cb: () => void) => instance.subscribeGlobal(cb), [instance]);
  const getGlobalVersion = useCallback(() => instance.globalVersion(), [instance]);
  useSyncExternalStore(subscribeGlobal, getGlobalVersion, getGlobalVersion);

  const controlledWidth = props.width;

  // Wire the adapter to the ScrollView's imperative scroll.
  adapter.scrollFn = (y, animated) => {
    scrollViewRef.current?.scrollTo({ y, animated });
  };

  // Attach the adapter as the engine's scroll element + re-anchoring hook.
  useEffect(() => {
    instance.attachScroller(el);
    instance.scrollAnchor = (delta: number) => {
      adapter.scrollTop += delta;
      instance.scrollTop = adapter.scrollTop;
      setScrollTop(adapter.scrollTop);
    };
    return () => {
      instance.attachScroller(null);
      instance.scrollAnchor = null;
    };
  }, [instance, adapter, el]);

  // Re-measure everything when fonts (re)register — `configureMugenNative`
  // bumps the epoch via notifyFontsChanged after registering font tables.
  useEffect(() => subscribeFonts(() => instance.remeasure()), [instance]);

  // ── Scroll controller: initialScroll + stickToBottom (smooth spring) ──
  const ctlRef = useRef<ScrollController | null>(null);
  if (ctlRef.current === null) ctlRef.current = new ScrollController();
  const ctl = ctlRef.current;
  useEffect(() => () => ctl.attach(null), [ctl]);

  const initial: InitialScrollOptions | null =
    props.initialScroll == null
      ? null
      : typeof props.initialScroll === 'string'
        ? { to: props.initialScroll }
        : props.initialScroll;

  const stickOpt = props.stickToBottom;
  const stickOn = stickOpt === true || (typeof stickOpt === 'object' && stickOpt !== null);
  const stickSpring: SpringOptions =
    typeof stickOpt === 'object' && stickOpt
      ? {
          damping: stickOpt.damping ?? DEFAULT_SPRING.damping,
          stiffness: stickOpt.stiffness ?? DEFAULT_SPRING.stiffness,
          mass: stickOpt.mass ?? DEFAULT_SPRING.mass,
        }
      : DEFAULT_SPRING;
  const stickInstant = typeof stickOpt === 'object' && stickOpt?.behavior === 'instant';
  const stickThreshold =
    (typeof stickOpt === 'object' && stickOpt?.threshold) || STICK_THRESHOLD_PX;

  const syncWindowFromEl = () => {
    instance.scrollTop = adapter.scrollTop;
    setScrollTop(adapter.scrollTop);
  };

  const prevTotalRef = useRef(-1);
  const lastFontEpochRef = useRef(fontEpoch());
  const lastViewportRef = useRef({ w: -1, h: -1 });
  const didInitialScroll = useRef(false);
  const initialEdgesRef = useRef<{ first: string; last: string; length: number } | null>(null);
  const initialKey =
    initial == null
      ? 'none'
      : initial.to === 'index'
        ? `index:${initial.index}:${initial.align ?? 'start'}:${initial.behavior ?? 'instant'}`
        : `${initial.to}:${initial.behavior ?? 'instant'}`;
  const lastInitialKeyRef = useRef(initialKey);

  // Back `instance.scrollToBottom()` with the controller (see web vlist).
  instance.scrollToBottomDriver = (behavior) => {
    ctl.attach(el);
    ctl.escaped = false;
    if (behavior === 'smooth') ctl.springToBottom(stickSpring);
    else {
      ctl.jumpToBottom();
      syncWindowFromEl();
    }
  };

  // Let `scrollToIndex` break the stick before scrolling up.
  instance.stickInterrupt = () => ctl.escape();

  // If the same mounted list is reused for a different data set, `initialScroll`
  // should apply to the new page too (see web vlist for the full reasoning).
  useLayoutEffect(() => {
    if (lastInitialKeyRef.current !== initialKey) {
      lastInitialKeyRef.current = initialKey;
      didInitialScroll.current = false;
      prevTotalRef.current = -1;
      ctl.stop();
    }
    if (initial == null) return;
    const length = instance.length;
    const next =
      length === 0
        ? { first: '__empty__', last: '__empty__', length }
        : { first: instance.keyAt(0), last: instance.keyAt(length - 1), length };
    const prev = initialEdgesRef.current;
    initialEdgesRef.current = next;
    if (!prev || !didInitialScroll.current) return;
    const filledEmptyPage = prev.length === 0 && next.length > 0;
    const replaced =
      filledEmptyPage ||
      (prev.length > 0 && next.length > 0 && prev.first !== next.first && prev.last !== next.last);
    if (!replaced) return;
    didInitialScroll.current = false;
    prevTotalRef.current = -1;
    ctl.stop();
  });

  // Apply `initialScroll` once, after the first real measure (content width and
  // total height are only known after onLayout fires).
  useLayoutEffect(() => {
    if (didInitialScroll.current) return;
    ctl.attach(el);
    instance.attachScroller(el);
    if (initial == null || initial.to === 'top') {
      didInitialScroll.current = true;
      return;
    }
    if (initial.to === 'index') {
      if (vh <= 0 || cw <= 0) return; // not measured yet — retry next render
      const target = instance.scrollTargetForIndex(initial.index, initial.align ?? 'start');
      if (target == null) {
        didInitialScroll.current = true;
        return;
      }
      if (initial.behavior === 'smooth') {
        adapter.scrollTo({ top: target, behavior: 'smooth' });
      } else {
        setScrollTopInstant(el, target);
      }
      syncWindowFromEl();
      didInitialScroll.current = true;
      return;
    }
    if (!ctl.hasOverflow()) return; // not measured yet — retry next render
    if (initial.behavior === 'smooth') {
      ctl.springToBottom(stickSpring);
    } else {
      ctl.jumpToBottom();
      syncWindowFromEl();
      prevTotalRef.current = instance.totalHeight();
    }
    didInitialScroll.current = true;
  });

  // Keep pinned to the bottom as content grows — reacts only to *growth*, never
  // to a plain re-render. Same reasoning as the web vlist, verbatim.
  useLayoutEffect(() => {
    if (!stickOn || !didInitialScroll.current) return;
    ctl.attach(el);
    const epoch = fontEpoch();
    const fontSettleGrowth = epoch !== lastFontEpochRef.current;
    lastFontEpochRef.current = epoch;
    const curW = controlledWidth ?? measured.current.width;
    const curH = props.height ?? measured.current.height;
    const resized = curW !== lastViewportRef.current.w || curH !== lastViewportRef.current.h;
    lastViewportRef.current = { w: curW, h: curH };
    const total = instance.totalHeight();
    const prevTotal = prevTotalRef.current;
    prevTotalRef.current = total;
    if (prevTotal < 0) return;
    if (total <= prevTotal + 0.5) return;
    if (ctl.escaped || !ctl.hasOverflow() || ctl.distanceFromBottom() <= 0.5) return;
    if (stickInstant || fontSettleGrowth || resized) {
      ctl.jumpToBottom();
      syncWindowFromEl();
    } else {
      ctl.springToBottom(stickSpring);
    }
  });

  // Stable text-defaults object (so Text's context doesn't churn on identity).
  const defaults = useMemo<TextDefaults>(
    () => ({
      font: props.font,
      lineHeight: props.lineHeight,
      letterSpacing: props.letterSpacing,
      whiteSpace: props.whiteSpace,
      wordBreak: props.wordBreak,
    }),
    [props.font, props.lineHeight, props.letterSpacing, props.whiteSpace, props.wordBreak],
  );

  // ── Sync config + viewport, then apply pending measures (compute-only) ──
  // No rem on React Native — the named `maxW` scale resolves against 16.
  const rootPx = 16;
  const vw = controlledWidth ?? measured.current.width;
  const vh = props.height ?? measured.current.height;
  instance.configure({
    getKey,
    render,
    renderTop: props.renderTop,
    renderBottom: props.renderBottom,
    defaults,
    maxW: props.maxW,
  });
  instance.setViewport(vw, vh, rootPx);
  instance.sync();

  // ── Deterministic initial anchor ──
  // When the viewport is already known at first render (controlled `width` +
  // `height`), resolve `initialScroll` NOW and hand it to the ScrollView as
  // its mount-time `contentOffset` — an imperative scrollTo racing the native
  // content layout can strand the viewport past the content (blank screen,
  // rows at negative y). Seeding also windows the FIRST measure/render at the
  // anchor instead of paying for the top of the list and jumping.
  // `anchorOffsetRef` doubles as the atomic channel for later scroll-anchor
  // shifts (see below); RN only re-applies `contentOffset` when its value
  // changes, so a stable object is inert across unrelated renders.
  const anchorOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const didSeedRef = useRef(false);
  if (
    !didSeedRef.current &&
    !didInitialScroll.current &&
    initial != null &&
    (initial.behavior ?? 'instant') !== 'smooth' &&
    vh > 0 &&
    instance.contentWidth() > 0
  ) {
    didSeedRef.current = true;
    let y = 0;
    if (initial.to === 'bottom') {
      y = Math.max(0, instance.totalHeight() - vh);
    } else if (initial.to === 'index') {
      y = instance.scrollTargetForIndex(initial.index, initial.align ?? 'start') ?? 0;
    }
    if (y > 0) {
      anchorOffsetRef.current = { x: 0, y };
      adapter.contentHeight = instance.totalHeight();
      adapter.viewportHeight = vh;
      adapter.onNativeScroll(y);
      instance.scrollTop = y;
      didInitialScroll.current = true;
      prevTotalRef.current = instance.totalHeight();
      if (scrollTop !== y) setScrollTop(y); // render-phase update: re-runs before commit
    }
  }

  const reachedRef = useRef<{ top: string | null; bottom: string | null }>({
    top: null,
    bottom: null,
  });

  // ── Flicker-free scroll anchoring (prepends) ──
  // The web applies anchor shifts post-commit, pre-paint. On RN the
  // corrective scroll cannot land with the commit: an imperative scrollTo is
  // a frame late (one-frame flash of the wrong content), and a `contentOffset`
  // prop update is applied by Fabric BEFORE the content grows, so iOS clamps
  // it to the OLD max (verified: the offset silently stayed put and the
  // viewport drifted a full page per prepend). Instead, two commits that are
  // each visually seamless: commit A renders the taller content WITH a
  // counter-translation of the whole canvas (identical pixels, offset still
  // old), then the corrective scrollTo lands and commit B drops the
  // translation (identical pixels again, offset now correct).
  // (Consuming the delta during render trades strict concurrent-safety for
  // atomicity; a discarded render loses at most one prepend's anchor.)
  const [pendingAnchor, setPendingAnchor] = useState<{ y: number; delta: number } | null>(null);
  {
    const anchorDelta = instance.takeScrollAnchorDelta();
    if (anchorDelta !== 0) {
      const max = Math.max(0, instance.totalHeight() - vh);
      const next = Math.max(0, Math.min(adapter.scrollTop + anchorDelta, max));
      const applied = next - adapter.scrollTop;
      adapter.onNativeScroll(next); // bookkeeping — the scroll itself is staged
      instance.scrollTop = next;
      if (instance.totalHeight() > vh + 1 && instance.length > 0) {
        reachedRef.current.top = instance.keyAt(0);
        reachedRef.current.bottom = instance.keyAt(instance.length - 1);
      }
      // Render-phase updates: React re-runs this component before committing.
      setPendingAnchor((cur) => ({ y: next, delta: (cur?.delta ?? 0) + applied }));
      if (scrollTop !== next) setScrollTop(next);
    }
  }

  // Commit A is on screen — send the corrective scroll; its onScroll clears
  // the translation (commit B).
  useLayoutEffect(() => {
    if (pendingAnchor !== null) adapter.scrollFn?.(pendingAnchor.y, false);
  }, [pendingAnchor, adapter]);

  // Programmatic writes re-window rows at JS speed. Following the native
  // onScroll round-trip instead leaves the window a frame behind — a write
  // larger than the overscan then paints bare canvas (a one-frame black
  // flash, e.g. the stick catching up after a large live append). Small
  // writes (spring frames) keep the immediate scroll; jumps beyond the
  // overscan go through the same choreography as anchor shifts, so the
  // target content is already painted on the frame the jump lands.
  const overscanRef = useRef(props.overscan ?? 200);
  overscanRef.current = props.overscan ?? 200;
  adapter.onProgrammaticWrite = (next, prev) => {
    instance.scrollTop = next;
    setScrollTop(next);
    if (Math.abs(next - prev) <= overscanRef.current) return false;
    setPendingAnchor((cur) => ({ y: next, delta: (cur?.delta ?? 0) + (next - prev) }));
    return true;
  };

  const total = instance.totalHeight();
  const overscan = props.overscan ?? 200;
  const cw = instance.contentWidth();
  const centered = instance.isCentered();
  const topSlotHeight = instance.topHeight();
  const bottomSlotTop = topSlotHeight + instance.itemsHeight();
  const topEdgeKey = instance.length === 0 ? '__empty__' : instance.keyAt(0);
  const bottomEdgeKey = instance.length === 0 ? '__empty__' : instance.keyAt(instance.length - 1);

  // Keep the adapter's geometry current every render (it *is* the scroll math).
  adapter.contentHeight = total;
  adapter.viewportHeight = vh;

  const rows: ReactNode[] = [];
  if (instance.length > 0 && vh > 0 && cw > 0) {
    const first = instance.indexAt(Math.max(0, scrollTop - overscan));
    const last = instance.indexAt(scrollTop + vh + overscan);
    for (let i = first; i <= last && i < instance.length; i++) {
      const key = instance.keyAt(i);
      rows.push(
        <RowView
          key={key}
          instance={instance}
          rowKey={key}
          item={instance.itemAt(i)}
          top={instance.offsetOf(i)}
          cw={cw}
          centered={centered}
        />,
      );
    }
  }

  useEffect(() => {
    if (vh <= 0) return;
    const st = adapter.scrollTop;
    const topThreshold = Math.max(0, props.topReachedThreshold ?? 0);
    const bottomThreshold = Math.max(0, props.bottomReachedThreshold ?? 0);
    const atTop = st <= topThreshold;
    const atBottom = st + vh >= total - bottomThreshold;
    const topIndex = instance.length === 0 ? -1 : 0;
    const bottomIndex = instance.length === 0 ? -1 : instance.length - 1;

    if (atTop) {
      if (props.onTopReached && reachedRef.current.top !== topEdgeKey) {
        props.onTopReached(topIndex);
        reachedRef.current.top = topEdgeKey;
      }
    } else {
      reachedRef.current.top = null;
    }

    if (atBottom) {
      if (props.onBottomReached && reachedRef.current.bottom !== bottomEdgeKey) {
        props.onBottomReached(bottomIndex);
        reachedRef.current.bottom = bottomEdgeKey;
      }
    } else {
      reachedRef.current.bottom = null;
    }
  }, [
    adapter,
    bottomEdgeKey,
    instance,
    props.bottomReachedThreshold,
    props.onBottomReached,
    props.onTopReached,
    props.topReachedThreshold,
    scrollTop,
    topEdgeKey,
    total,
    vh,
  ]);

  const slotStyle = (top: number): ViewStyle => ({
    position: 'absolute',
    top,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: centered ? 'center' : 'flex-start',
  });

  const topSlot =
    props.renderTop && cw > 0 ? (
      <View style={slotStyle(0)}>
        <View style={{ width: cw }}>
          <WidthContext.Provider value={cw}>{props.renderTop()}</WidthContext.Provider>
        </View>
      </View>
    ) : null;

  const bottomSlot =
    props.renderBottom && cw > 0 ? (
      <View style={slotStyle(bottomSlotTop)}>
        <View style={{ width: cw }}>
          <WidthContext.Provider value={cw}>{props.renderBottom()}</WidthContext.Provider>
        </View>
      </View>
    ) : null;

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width === measured.current.width && height === measured.current.height) return;
    measured.current = { width, height };
    adapter.viewportHeight = props.height ?? height;
    instance.notifyGlobal();
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const st = e.nativeEvent.contentOffset.y;
    // The corrective scroll for a staged anchor landed — drop the
    // counter-translation (commit B of the anchoring choreography).
    setPendingAnchor((cur) => (cur === null ? cur : null));
    adapter.onNativeScroll(st);
    instance.setScrollTop(st); // updates scrollTop + wakes useMugenSelector
    setScrollTop(st);
    if (stickOn) ctl.handleScroll(stickThreshold);
  };

  return (
    <ScrollView
      ref={scrollViewRef}
      onLayout={controlledWidth != null && props.height != null ? undefined : onLayout}
      onScroll={onScroll}
      scrollEventThrottle={16}
      // Break the stick from user *input* — a drag is the RN analog of the web's
      // touchstart/touchend pair (wheel has no mobile equivalent).
      onScrollBeginDrag={stickOn ? () => ctl.handleTouchStart() : undefined}
      onScrollEndDrag={stickOn ? () => ctl.handleTouchEnd(stickThreshold) : undefined}
      // mugen does its own scroll anchoring; the platform's would double-adjust.
      maintainVisibleContentPosition={undefined}
      removeClippedSubviews={false}
      keyboardDismissMode={props.keyboardDismissMode}
      keyboardShouldPersistTaps={props.keyboardShouldPersistTaps}
      // The atomic offset channel: seeded at mount for `initialScroll`, and
      // updated on scroll-anchor shifts so the corrected offset lands in the
      // same native transaction as the content that moved. Stable identity
      // between shifts — RN re-applies only on value change.
      contentOffset={anchorOffsetRef.current ?? undefined}
      style={[props.height != null ? { height: props.height, flexGrow: 0 } : { flex: 1 }, props.style]}
    >
      <View
        // Counter-translation while a corrective anchor scroll is in flight:
        // the taller canvas paints pixel-identically at the stale offset.
        // Cleared by the scroll's own onScroll. (A conditional entry, not a
        // `transform: undefined` key — RN's style validator rejects that.)
        style={[
          { height: total, width: '100%' },
          pendingAnchor !== null ? { transform: [{ translateY: -pendingAnchor.delta }] } : null,
        ]}
      >
        <TextDefaultsContext.Provider value={defaults}>
          {topSlot}
          {rows}
          {bottomSlot}
        </TextDefaultsContext.Provider>
      </View>
    </ScrollView>
  );
}
