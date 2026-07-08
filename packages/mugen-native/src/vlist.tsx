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
  Animated,
  Platform,
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
  type MugenHeightCache,
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

/**
 * iOS canvas headroom. Rows render into a canvas whose top edge (the
 * "origin") starts a million px down and MOVES UP as history prepends —
 * `contentInset` clamps the scrollable range to the occupied region. A
 * prepend then never needs a corrective scroll at all: the commit is atomic
 * (existing rows keep their canvas coordinates), which is the only way to be
 * flash-free on Fabric, where a scroll command and a commit can land on
 * different frames. Android's contentInset semantics differ, so it keeps the
 * two-commit choreography instead. Exported for tests.
 */
export const CANVAS_HEADROOM = Platform.OS === 'ios' ? 1_000_000 : 0;

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
  /**
   * Measure only the first `head` and last `tail` UNCACHED rows up front;
   * estimate the rest and refine them in idle time (and instantly for any
   * row about to paint). Turns a cold heavy transcript's open from a full
   * measure walk into a few screens' worth. See `MugenInstance.lazyMeasure`.
   */
  lazyMeasure?: { head: number; tail: number };
  /**
   * Persistent height store. Heights are pure functions of (content, width,
   * fonts) — an app that persists them (sqlite, MMKV) opens a list with every
   * offset known and walks ZERO rows. Compose content identity, width, and a
   * font signature into your storage key; skip volatile keys (live/streaming
   * rows). See `MugenHeightCache`.
   */
  heightCache?: MugenHeightCache;
}

/**
 * Create (and own, across renders) a list instance for `items` — the shared
 * mugen engine, identical to the web. Pass the returned instance to
 * `<MugenVList>`; call `instance.scrollToItem(key)` to scroll.
 */
export function useMugenVirtualizer<T>(options: UseMugenVirtualizerOptions<T>): MugenInstance<T> {
  const ref = useRef<MugenInstance<T> | null>(null);
  if (ref.current === null) ref.current = new MugenInstance<T>();
  ref.current.heightCache = options.heightCache ?? null;
  ref.current.lazyMeasure = options.lazyMeasure ?? null;
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
  /**
   * Extra px rendered above/below the viewport. Default 200. Pass `Infinity`
   * for RESIDENT mode: every row stays mounted (exact analytic heights make
   * this affordable) and scrolling involves ZERO JavaScript — no window to
   * chase, so no velocity can ever outrun it. Reach callbacks are inactive
   * in resident mode.
   */
  overscan?: number;
  /**
   * Show the scroll indicator (default true). mugen draws its OWN indicator —
   * a native-driver overlay whose geometry comes from the engine's exact
   * heights — because the platform indicator misreads the iOS headroom canvas
   * (it re-derives its size from the huge content size + shifting inset and
   * visibly resizes). Ours is exact at every frame: position and proportion
   * are (scrollTop / totalHeight), values mugen knows analytically. It shows
   * during user scrolls and fades when motion stops; programmatic and
   * streaming growth scrolls don't flash it.
   */
  showsVerticalScrollIndicator?: boolean;
  /**
   * Inset the drawn indicator's TRACK from the viewport edges (content still
   * scrolls full-height underneath). Pass the floating header height as `top`
   * and the floating composer height as `bottom` so the bar rides between
   * them instead of under them — ChatGPT-style.
   */
  scrollIndicatorInsets?: { top?: number; bottom?: number };
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
  /** Forwarded to the underlying ScrollView (native intercepts key off it). */
  testID?: string;
  /**
   * iOS status-bar-tap candidacy (default true). iOS silently ignores the tap
   * when 2+ visible scroll views claim it — an app that keeps several lists
   * mounted (a pane pool, a drawer) must leave `scrollsToTop` on ONLY the
   * active one.
   */
  scrollsToTop?: boolean;
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

// ── View recycling (the legend-list model) ──
// Windowing that mounts/unmounts rows at the edges freezes on Hermes (mounting
// a heavy markdown row costs real time) and re-renders the whole list every
// scroll frame. Instead we keep a FIXED POOL of stable-key slots and, on
// scroll, only change WHICH row each slot shows via `SlotStore` (an external
// store the slots subscribe to individually) — the list never re-renders on
// scroll, and a slot's `<RowView>` is REUSED across reassignments (no `key`),
// so React reconciles new content into the existing view tree instead of
// destroying and recreating it. For structurally-uniform rows (one Text node
// per block) that reconcile is a cheap text update. Rows still in the window
// are untouched; per frame we touch only the few slots a row entered or left.
interface SlotAssignment<T> {
  rowKey: string;
  item: T;
  top: number;
  cw: number;
  centered: boolean;
}

class SlotStore<T> {
  private assign: (SlotAssignment<T> | null)[] = [];
  private ver: number[] = [];
  private subs: Set<() => void>[] = [];

  ensure(size: number): void {
    while (this.assign.length < size) {
      this.assign.push(null);
      this.ver.push(0);
      this.subs.push(new Set());
    }
  }
  subscribe(i: number, cb: () => void): () => void {
    this.ensure(i + 1);
    this.subs[i]!.add(cb);
    return () => this.subs[i]!.delete(cb);
  }
  version(i: number): number {
    return this.ver[i] ?? 0;
  }
  get(i: number): SlotAssignment<T> | null {
    return this.assign[i] ?? null;
  }
  /** Returns whether the assignment actually changed. `notify` wakes the
   *  slot's subscribers immediately — ONLY legal from event handlers
   *  (onScroll); a render-phase caller must pass false and deliver the
   *  notification post-commit via `notify()` (React forbids setState on
   *  another component during render). */
  set(i: number, next: SlotAssignment<T> | null, notify: boolean): boolean {
    this.ensure(i + 1);
    const cur = this.assign[i]!;
    if (
      cur === next ||
      (cur != null &&
        next != null &&
        cur.rowKey === next.rowKey &&
        cur.item === next.item && // content identity — a streaming row keeps its
        cur.top === next.top && //  key + position but its item changes; must update
        cur.cw === next.cw &&
        cur.centered === next.centered)
    ) {
      return false;
    }
    this.assign[i] = next;
    this.ver[i] = (this.ver[i] ?? 0) + 1;
    if (notify) for (const cb of this.subs[i]!) cb();
    return true;
  }
  /** Wake a slot's subscribers (post-commit delivery of a silent `set`). */
  notify(i: number): void {
    for (const cb of this.subs[i] ?? []) cb();
  }
}

// One pooled slot: subscribes to its store entry and paints its assigned row.
// Stable `key={id}` means React never unmounts the slot on scroll. The
// `<RowView>` inside is deliberately NOT keyed by rowKey, so a reassigned slot
// REUSES the RowView fiber and reconciles new content into existing views
// (cheap for same-shape rows) rather than remounting. The `useMugenRow` hook
// flip that made this unsafe is fixed in the engine (notifications that fire
// during the measure walk are deferred, so no nested component re-renders
// while a measure session is ambient).
const Slot = memo(function Slot<T>(props: {
  store: SlotStore<T>;
  id: number;
  instance: MugenInstance<T>;
}): ReactElement | null {
  const { store, id, instance } = props;
  const subscribe = useCallback((cb: () => void) => store.subscribe(id, cb), [store, id]);
  const getVersion = useCallback(() => store.version(id), [store, id]);
  useSyncExternalStore(subscribe, getVersion, getVersion);
  const a = store.get(id);
  if (a === null) return null;
  return (
    <RowView
      instance={instance}
      rowKey={a.rowKey}
      item={a.item}
      top={a.top}
      cw={a.cw}
      centered={a.centered}
    />
  );
}) as <T>(props: { store: SlotStore<T>; id: number; instance: MugenInstance<T> }) => ReactElement | null;

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
  // Canvas-space = engine-space + origin. Engine/adapter stay pure.
  const originRef = useRef(CANVAS_HEADROOM);
  const [scrollTop, setScrollTop] = useState(0);
  const measured = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const velocityRef = useRef(0);
  const scrollSampleRef = useRef<{ t: number; y: number } | null>(null);

  // Recycling pool: a stable set of slots reassigned on scroll (see SlotStore).
  const slotStoreRef = useRef<SlotStore<T> | null>(null);
  if (slotStoreRef.current === null) slotStoreRef.current = new SlotStore<T>();
  const slotStore = slotStoreRef.current;
  const rowToSlotRef = useRef<Map<string, number>>(new Map());
  const [poolSize, setPoolSize] = useState(0);
  const poolSizeRef = useRef(0);
  poolSizeRef.current = poolSize;
  const allocateRef = useRef<((center: number, notify: boolean, alsoCover?: number) => void) | null>(
    null,
  );
  // Slots reassigned during a RENDER-phase allocate; woken post-commit (the
  // set is kept small by the render-path bind budget in allocate).
  const dirtySlotsRef = useRef<Set<number>>(new Set());
  // The last projected fling landing (from onScroll) — carried into drain
  // passes so the landing stays covered between scroll events.
  const projectedRef = useRef<number | undefined>(undefined);
  // A budget-starved allocate schedules ONE follow-up pass; without it, a
  // scroll that settles before the window is fully bound leaves the screen
  // bare forever (allocate is otherwise event-driven only).
  const drainScheduledRef = useRef(false);
  const renderStarvedRef = useRef(false);
  // A render-phase allocate resolved estimates silently; flush post-commit.
  const pendingSilentRefineRef = useRef(false);
  const renderStarvedNearRef = useRef(false);
  const scheduleDrainRef = useRef<((near: boolean) => void) | null>(null);
  const idleDrainTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (idleDrainTimerRef.current !== null) clearTimeout(idleDrainTimerRef.current);
      if (refineTimerRef.current !== null) clearTimeout(refineTimerRef.current);
    },
    [],
  );

  // ── mugen-drawn scroll indicator ──
  // The native offset in canvas coordinates, driven on the UI thread — the
  // indicator tracks every scroll frame with zero JS work.
  const indicatorY = useRef(new Animated.Value(0)).current;
  const indicatorOpacity = useRef(new Animated.Value(0)).current;
  const indicatorShownRef = useRef(false);
  const indicatorHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Only user gestures (and their momentum) show the bar — streaming growth
  // and programmatic jumps scroll too, and flashing it there reads as noise.
  const indicatorPokeUntilRef = useRef(0);
  const pokeIndicator = () => {
    if (performance.now() > indicatorPokeUntilRef.current) return;
    if (!indicatorShownRef.current) {
      indicatorShownRef.current = true;
      Animated.timing(indicatorOpacity, { toValue: 1, duration: 80, useNativeDriver: true }).start();
    }
    if (indicatorHideTimer.current) clearTimeout(indicatorHideTimer.current);
    indicatorHideTimer.current = setTimeout(() => {
      indicatorShownRef.current = false;
      Animated.timing(indicatorOpacity, { toValue: 0, duration: 350, useNativeDriver: true }).start();
    }, 650);
  };
  useEffect(
    () => () => {
      if (indicatorHideTimer.current) clearTimeout(indicatorHideTimer.current);
    },
    [],
  );

  // Re-render whenever any row is invalidated.
  const subscribeGlobal = useCallback((cb: () => void) => instance.subscribeGlobal(cb), [instance]);
  const getGlobalVersion = useCallback(() => instance.globalVersion(), [instance]);
  useSyncExternalStore(subscribeGlobal, getGlobalVersion, getGlobalVersion);

  const controlledWidth = props.width;

  // Wire the adapter to the ScrollView's imperative scroll.
  adapter.scrollFn = (y, animated) => {
    scrollViewRef.current?.scrollTo({ y: y + originRef.current, animated });
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
  // From deep in history no honest animation can cross the distance in
  // reasonable time — the wormhole glides one continuous stretch of real
  // pixels instead and re-engages the stick on arrival.
  instance.scrollToBottomDriver = (behavior) => {
    ctl.attach(el);
    const maxSt = Math.max(0, instance.totalHeight() - vh);
    if (behavior === 'smooth') {
      if (maxSt - adapter.scrollTop > vh * 3) {
        // Stay escaped during the flight: streaming growth mid-wormhole would
        // otherwise fire the stick spring and fight the glide. Arrival
        // re-engages (see finish()).
        ctl.escaped = true;
        wormholeTo(maxSt, 1);
      } else {
        ctl.escaped = false;
        ctl.springToBottom(stickSpring);
      }
    } else {
      ctl.escaped = false;
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
    // A data swap invalidates a mid-flight wormhole's corridor and shift —
    // drop it without re-normalizing (initialScroll re-anchors everything).
    wormholeAbortRef.current?.();
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
      anchorOffsetRef.current = { x: 0, y: originRef.current + y };
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
      if (CANVAS_HEADROOM > 0) {
        // Origin absorption (iOS): the canvas top edge moves up instead of
        // the scroll moving down. Existing rows keep their canvas coords and
        // the native offset is never touched — nothing to race, no flash.
        originRef.current = Math.max(0, originRef.current - applied);
      } else {
        setPendingAnchor((cur) => ({ y: next, delta: (cur?.delta ?? 0) + applied }));
      }
      // Render-phase update: React re-runs this component before committing.
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
  const [pendingJump, setPendingJump] = useState<{ from: number; to: number } | null>(null);
  const lastProgWriteRef = useRef(0);
  adapter.onProgrammaticWrite = (next, prev) => {
    instance.scrollTop = next;
    // Rebind slots directly — the smooth-scroll spring writes EVERY FRAME,
    // and a React list-state update per frame is a full list re-render per
    // frame: the spring animation itself drops to slideshow fps. The slot
    // path costs O(rows crossing an edge), same as onScroll. Rapid successive
    // writes are animation frames even when a single step exceeds the
    // overscan (a spring moving fast mid-flight) — pre-bind a few steps ahead
    // instead of churning pendingJump state per frame.
    const now = performance.now();
    const animating = now - lastProgWriteRef.current < 100;
    lastProgWriteRef.current = now;
    const step = next - prev;
    if (Math.abs(step) <= overscanRef.current || animating) {
      allocateRef.current?.(
        next,
        true,
        animating && Math.abs(step) > overscanRef.current ? next + step * 3 : undefined,
      );
      return false;
    }
    // Isolated big jump: paint BOTH the departure and destination windows in
    // one commit, so neither ordering of (scroll command, commit) can show
    // bare canvas. The landing onScroll drops the departure window.
    allocateRef.current?.(prev, true, next);
    setPendingJump({ from: prev, to: next });
    return true;
  };

  useLayoutEffect(() => {
    if (pendingJump !== null) {
      // Stamp the deferred scroll too — its onScroll echo is a jump, not
      // motion, and must not enter the velocity estimate.
      lastProgWriteRef.current = performance.now();
      adapter.scrollFn?.(pendingJump.to, false);
    }
  }, [pendingJump, adapter]);

  // ── Wormhole: CONTINUOUS smooth scroll across any distance, bounded time ──
  // A long "scroll to top/bottom" cannot honestly animate its full distance
  // (crossing 100k px at any readable pace either blanks or takes seconds),
  // and a teleport into glide range shows a hard cut. Slots are absolutely
  // positioned on the canvas, so mugen can do what neither can: lay the
  // DESTINATION's real neighborhood just beyond the current viewport (a
  // temporary top for the corridor rows — the same one-frame commit any
  // rebind is), glide one short stretch of real pixels on the UI thread,
  // then RE-NORMALIZE coordinates with the headroom canvas's origin
  // absorption — identical pixels, native offset untouched, exactly the
  // mechanism prepends use. The user sees one unbroken motion arriving at
  // real content, in ~a third of a second regardless of distance.
  const wormholeRef = useRef<{
    target: number;
    glideTo: number;
    shift: number;
    dir: 1 | -1;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const wormholeFinishRef = useRef<(() => void) | null>(null);
  const wormholeAbortRef = useRef<(() => void) | null>(null);
  const wormholeTo = (target: number, dir: 1 | -1): void => {
    if (wormholeRef.current !== null) return; // one at a time
    const st = adapter.scrollTop;
    // The corridor must tile with EXACT heights — an estimated row painted at
    // an estimated offset would land the glide on misaligned content. Resolve
    // the destination zone SILENTLY (a notify here re-renders the list, whose
    // render-phase allocate would immediately rebind the corridor to real
    // positions) and absorb the height deltas inline, exactly like the
    // render-phase anchor block: refined rows above the viewport shift the
    // origin, never the pixels.
    if (instance.estimatedCount() > 0) {
      for (let pass = 0; pass < 4; pass++) {
        const keys = new Set<string>();
        if (dir === -1) {
          for (let i = 0; i < instance.length && instance.offsetOf(i) < vh * 2.5; i++) {
            const k = instance.keyAt(i);
            if (instance.isEstimated(k)) keys.add(k);
          }
        } else {
          const total = instance.totalHeight();
          for (let i = instance.length - 1; i >= 0 && instance.offsetOf(i) > total - vh * 2.5; i--) {
            const k = instance.keyAt(i);
            if (instance.isEstimated(k)) keys.add(k);
          }
        }
        if (keys.size === 0) break;
        instance.refineKeys(keys, { notify: false });
      }
      const anchorDelta = instance.takeScrollAnchorDelta();
      if (anchorDelta !== 0) {
        const max = Math.max(0, instance.totalHeight() - vh);
        const next = Math.max(0, Math.min(adapter.scrollTop + anchorDelta, max));
        const applied = next - adapter.scrollTop;
        adapter.onNativeScroll(next);
        instance.scrollTop = next;
        // Origin absorption (iOS headroom). The contentInset prop refreshes on
        // the finish() commit; the interim staleness is unreachable mid-glide.
        originRef.current = Math.max(0, originRef.current - applied);
      }
    }
    const stNow = adapter.scrollTop;
    const total = instance.totalHeight();
    const origin = originRef.current;
    // Corridor = the destination-side rows that will fill exactly one glide of
    // ≥ one viewport, SNAPPED to a row boundary so the seam between departure
    // content and corridor is edge-to-edge — no overlap, no gap.
    let first: number;
    let last: number;
    let glideDist: number;
    if (dir === -1) {
      // To the top: rows [0 .. k-1] where row k is the first at/below one
      // viewport — they tile [0, offsetOf(k)) and land above the viewport.
      const k = Math.max(
        1,
        instance.indexAt(vh) + (instance.offsetOf(instance.indexAt(vh)) < vh ? 1 : 0),
      );
      first = 0;
      last = Math.min(k, instance.length - 1);
      glideDist = Math.min(stNow, instance.offsetOf(Math.min(k, instance.length - 1)) || vh);
      if (glideDist <= 0) return;
    } else {
      // To the bottom: rows [j ..] tiling [offsetOf(j), total], presented so
      // their top edge sits exactly at the departure viewport's bottom.
      const maxSt = Math.max(0, total - vh);
      const j = instance.indexAt(maxSt);
      first = j;
      last = instance.length - 1;
      glideDist = vh + (maxSt - instance.offsetOf(j));
    }
    const glideTo = stNow + dir * glideDist;
    // Where the corridor pretends to be, minus where it is.
    const shift = dir === -1 ? stNow - glideDist : stNow + vh - instance.offsetOf(first);
    const map = rowToSlotRef.current;
    // Hide every mapped row whose REAL canvas position intrudes on the glide
    // window (overscan neighbors of the departure viewport included — they
    // are offscreen, so hiding them changes no pixels). The visible departure
    // rows themselves stay: they slide out as real content.
    const visLo = stNow - 1;
    const visHi = stNow + vh + 1;
    const glideLo = Math.min(stNow, glideTo) - vh;
    const glideHi = Math.max(stNow + vh, glideTo + vh) + vh;
    for (const [key, slot] of [...map]) {
      const idx = instance.indexOfKey(key);
      if (idx === undefined) continue;
      if (idx >= first && idx <= last) continue; // corridor member
      const top = instance.offsetOf(idx);
      const bottom = idx + 1 < instance.length ? instance.offsetOf(idx + 1) : total;
      const visible = bottom > visLo && top < visHi;
      const inGlide = bottom > glideLo && top < glideHi;
      if (inGlide && !visible) {
        map.delete(key);
        slotStore.set(slot, null, true);
      }
    }
    // Present the corridor at its temporary (shifted) position.
    let scan = 0;
    const used = new Set(map.values());
    for (let i = first; i <= last && i < instance.length; i++) {
      if (instance.itemAt(i) == null) continue; // transient hole mid-swap
      const key = instance.keyAt(i);
      let slot = map.get(key);
      if (slot == null) {
        while (scan < poolSizeRef.current && (used.has(scan) || slotStore.get(scan) !== null))
          scan++;
        if (scan >= poolSizeRef.current) {
          poolSizeRef.current = poolSizeRef.current + Math.max(8, last - i + 1);
          slotStore.ensure(poolSizeRef.current);
          setPoolSize(poolSizeRef.current);
        }
        slot = scan;
        map.set(key, slot);
        used.add(slot);
      }
      slotStore.set(
        slot,
        {
          rowKey: key,
          item: instance.itemAt(i),
          top: origin + instance.offsetOf(i) + shift,
          cw,
          centered,
        },
        true,
      );
    }
    const finish = (): void => {
      const w = wormholeRef.current;
      if (w === null) return;
      wormholeRef.current = null;
      clearTimeout(w.timer);
      // RE-NORMALIZE: move the canvas origin so the corridor rows' REAL
      // positions equal their painted ones — identical pixels, native offset
      // untouched (the same absorption prepends use; the iOS headroom has
      // room in both directions). Works mid-glide too (a finger grab): the
      // content coordinate becomes wherever the offset maps to.
      originRef.current = Math.max(0, originRef.current + w.shift);
      const stFinal = Math.max(0, adapter.scrollTop - w.shift);
      adapter.onNativeScroll(stFinal);
      instance.setScrollTop(stFinal); // wakes useMugenSelector consumers too
      lastProgWriteRef.current = performance.now();
      scrollSampleRef.current = null; // pre/post-wormhole samples don't compose
      setScrollTop(stFinal); // render: contentInset + every slot top refresh atomically
      if (stickOn && w.dir === 1) {
        ctl.attach(el);
        ctl.escaped = false;
        // Content that streamed in mid-flight grew past the corridor's bottom
        // edge — let the stick close the residue smoothly.
        if (ctl.distanceFromBottom() > 0.5) ctl.springToBottom(stickSpring);
      }
    };
    wormholeRef.current = {
      target,
      glideTo,
      shift,
      dir,
      timer: setTimeout(finish, 900), // fallback if the settle event is missed
    };
    wormholeFinishRef.current = finish;
    // A DATA SWAP mid-flight (living-pane session switch) invalidates the
    // corridor's shift entirely — drop the wormhole WITHOUT re-normalizing
    // (the new data's initialScroll re-anchors everything anyway).
    wormholeAbortRef.current = () => {
      const w = wormholeRef.current;
      if (w === null) return;
      wormholeRef.current = null;
      clearTimeout(w.timer);
      lastProgWriteRef.current = performance.now();
      scrollSampleRef.current = null;
    };
    lastProgWriteRef.current = performance.now();
    adapter.scrollTo({ top: glideTo, behavior: 'smooth' });
  };

  // ── Smooth scroll to the very top (status-bar tap, app affordances) ──
  // The system flight is intercepted natively (`scrollViewShouldScrollToTop:`
  // returning NO) and answered here: near the top a plain native glide; from
  // deep history the wormhole — one continuous motion, no cut, no blank.
  instance.scrollToTopDriver = (behavior) => {
    const st = adapter.scrollTop;
    if (stickOn) ctl.escape();
    projectedRef.current = undefined;
    lastProgWriteRef.current = performance.now();
    if (behavior !== 'smooth') {
      ctl.attach(el);
      ctl.jumpToTop();
      syncWindowFromEl();
      return;
    }
    if (st > vh * 3) wormholeTo(0, -1);
    else if (st > 0.5) adapter.scrollTo({ top: 0, behavior: 'smooth' });
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

  const resident = !Number.isFinite(overscan);

  // Assign the current window's rows to pool slots, reusing the slot a row
  // already holds (rows staying in view are untouched) and filling vacated
  // slots with rows that entered. `notify:false` seeds during render; `true`
  // from onScroll wakes only the reassigned slots (no list re-render). Grows
  // the pool (a rare state update) when a window needs more slots.
  const allocate = (center: number, notify: boolean, alsoCover?: number): void => {
    if (resident || instance.length === 0 || vh <= 0 || cw <= 0) return;
    // A wormhole owns the slot pool while it flies (~a third of a second):
    // the corridor sits at TEMPORARY tops, and any allocate — a streaming
    // re-render, a pool-growth commit, a drain — would rebind it to real
    // positions mid-glide and tear the illusion. Everything rebinds on the
    // finish() commit.
    if (wormholeRef.current !== null) return;
    const v = velocityRef.current;
    // Velocity-scaled directional lead: cover ~250ms of travel at the current
    // velocity so upcoming rows are bound before they're visible.
    const lead = Math.min(4500, Math.abs(v) * 0.3);
    const leadUp = v < 0 ? lead : 0;
    const leadDown = v > 0 ? lead : 0;
    const origin = originRef.current;
    const need: number[] = [];
    const seen = new Set<number>();
    const addRange = (c: number, up: number, down: number): void => {
      const first = instance.indexAt(Math.max(0, c - overscan - up));
      const last = instance.indexAt(c + vh + overscan + down);
      for (let i = first; i <= last && i < instance.length; i++) {
        if (!seen.has(i)) {
          seen.add(i);
          need.push(i);
        }
      }
    };
    addRange(center, leadUp, leadDown);
    // The transcript TOP stays bound at all times. It is the fixed target of
    // the iOS status-bar tap, whose fixed-duration native flight crosses the
    // whole history faster than any bind can chase and cannot be intercepted
    // from JS (Fabric ignores programmatic scrolls while it runs; its events
    // coalesce behind commits). A permanently warm first screen costs a
    // handful of slots — bound once by the drain after open, never evicted —
    // and the flight then always lands on painted ground.
    addRange(0, 0, vh / 2);
    // A projected fling DESTINATION (from onScrollEndDrag): bind the landing
    // zone NOW, while the fling flies — pretext's exact offsets tell us
    // precisely which rows land there. By the time deceleration is slow
    // enough to read, the destination is painted. This is the advantage of
    // knowing every height up front.
    if (alsoCover !== undefined) addRange(alsoCover, vh / 2, vh);
    if (pendingJump !== null) addRange(pendingJump.from, 0, 0);

    // Bounded pool (small = instant unmount when the session closes, which is
    // what keeps NAVIGATION instant). Growth is rare and small; batched.
    if (need.length + 2 > poolSizeRef.current) {
      const grown = Math.ceil(need.length * 1.6) + 8;
      poolSizeRef.current = grown;
      slotStore.ensure(grown);
      setPoolSize(grown);
    }

    // Priority: two regimes, split by whether transit content can PHYSICALLY
    // paint. A bind takes ~2-3 frames to reach the screen; once the viewport
    // turns over faster than that (|v| > ~20 viewports/s, extreme chained
    // momentum), every near-field bind is off-screen before its commit lands
    // — the whole budget burns on rows nobody can ever see while the landing
    // starves, and the screen stays bare for the entire multi-second
    // deceleration. In that regime anchor the sort at the projected LANDING:
    // it is the only region that will still be on screen when paint catches
    // up. At bindable speeds, near field first — what the viewport is about
    // to cross must bind before it arrives; the landing zone is merely
    // INCLUDED in `need` (protected from eviction, filled with leftover
    // budget). Anchoring at the destination in THAT regime starves the
    // transit and makes blanking worse (measured both ways).
    const hopeless = alsoCover !== undefined && Math.abs(v) > vh * 20;
    const anchor = hopeless
      ? alsoCover! + vh / 2
      : center + vh / 2 + Math.max(-900, Math.min(900, v * 0.08));
    const dist = (i: number): number => Math.abs(instance.offsetOf(i) - anchor);
    need.sort((a, b) => dist(a) - dist(b));

    const prev = rowToSlotRef.current;
    const used = new Set<number>();
    // Keep prior mappings: slots NOT reassigned this pass retain their row
    // (mounted, offscreen) — an instant cache when the user scrolls back, and
    // zero wake cost. Entries are evicted only when their slot is taken.
    const nextMap = new Map(prev);
    const slotToKey = new Map<number, string>();
    for (const [k, s] of prev) slotToKey.set(s, k);
    const needKeys = new Set<string>();
    for (const i of need) needKeys.add(instance.keyAt(i));
    // Rows that will paint must carry REAL heights — resolve any estimates in
    // the bind window as ONE batch (per-row resolution inside the scroll path
    // is a notification storm: a re-render per row per event). On the RENDER
    // path the refine must be SILENT — notifying wakes subscribers mid-render
    // (React: "Cannot update a component while rendering a different
    // component"; the LogBox storm it triggers in dev is its own lag) — the
    // layout effect flushes post-commit.
    if (instance.estimatedCount() > 0) {
      const touched = instance.refineKeys(needKeys, { notify });
      if (touched && !notify) pendingSilentRefineRef.current = true;
    }

    const put = (slot: number, i: number): void => {
      // ROOT GUARD: never bind a slot to a nullish item. A stale render-phase
      // allocate mid data-swap can present an index whose item the new list no
      // longer has; binding it would paint `render(undefined)` and crash the
      // measure walk. Skipping leaves the slot's prior (valid) assignment until
      // the next allocate rebinds it — invisible, never a crash.
      if (i < 0 || i >= instance.length || instance.itemAt(i) == null) return;
      const key = instance.keyAt(i);
      used.add(slot);
      const evicted = slotToKey.get(slot);
      if (evicted !== undefined && evicted !== key) nextMap.delete(evicted);
      slotToKey.set(slot, key);
      nextMap.set(key, slot);
      const changed = slotStore.set(
        slot,
        { rowKey: key, item: instance.itemAt(i), top: origin + instance.offsetOf(i), cw, centered },
        notify,
      );
      // Render-phase caller: deliver the wake post-commit (see layout effect).
      if (changed && !notify) dirtySlotsRef.current.add(slot);
    };

    // Rows already holding a slot refresh in place (usually a no-op).
    const fresh: number[] = [];
    for (const i of need) {
      const s = prev.get(instance.keyAt(i));
      if (s != null && s < poolSizeRef.current && !used.has(s)) put(s, i);
      else fresh.push(i);
    }
    // Fresh rows REBIND recycled slots (evicting rows that left the window),
    // nearest-to-anchor first. The per-event budget is measured in CONTENT
    // HEIGHT, not row count: a rebind is a markdown reconcile whose cost
    // tracks how much content the row holds, and pretext gives every height
    // analytically. A count budget lets one event batch several monster rows
    // into a single multi-hundred-ms commit — the stall that starves scroll
    // events, poisons the velocity estimate, and blanks the transit. Rows
    // INTERSECTING the viewport bypass the budget in the near-field regime
    // (what the user is looking at binds NOW); at unpaintable speeds the
    // bypass would steal the budget from the landing, so it's off.
    // The height budget applies on BOTH paths — a render-phase (mount/data)
    // allocate that binds an unbounded window is one multi-hundred-ms commit.
    // Viewport rows always bind (the bypass below); the overscan tail drains
    // post-commit, so opens paint the visible screen first and fill outward.
    const FRESH_PER_EVENT = Math.abs(v) > 8000 ? 10 : 6;
    // Content-height budget for one synchronous bind pass. The RENDER path
    // (notify=false) that ISN'T a cold mount is a DATA SWAP — a session switch
    // rebinds every visible slot to brand-new heavy markdown. Binding two
    // viewports there was a ~300ms reconcile in one commit (the visible
    // "stutter on every switch"). Bind just the visible screen (~1.2vh)
    // synchronously so it paints fast; the offscreen tail is starved and fills
    // via the drain — it's outside the viewport, so its fill is invisible.
    // Scroll (notify) keeps the larger budget: its transit must stay ahead of
    // the finger.
    const budgetPx = notify ? vh * (Math.abs(v) > 8000 ? 3 : 2) : vh * 1.2;
    const cap = notify ? FRESH_PER_EVENT : Number.POSITIVE_INFINITY;
    // A COLD MOUNT (no rows bound yet — a fresh session open) is budgeted
    // like any data swap: bind the VISIBLE screen in the mount commit and
    // drain the overscan invisibly afterward. Binding the whole primary
    // window in one commit (the previous design) rendered 40-80 heavy
    // markdown rows synchronously — measured ~1.8s on a 1002-row transcript
    // (profiled: sync/setItems/allocate were all <50ms; the whole cost was
    // React committing offscreen rows nobody could see yet). The mount also
    // SKIPS the top-landing exemption: the drain binds the transcript top
    // within a few frames, far sooner than any human can reach the status
    // bar after an open.
    const coldMount = !notify && prev.size === 0;
    const nearLo = center - overscan - leadUp - vh;
    const nearHi = center + vh + overscan + leadDown + vh;
    const inNearWindow = (i: number): boolean => {
      const t = instance.offsetOf(i);
      return t > nearLo && t < nearHi;
    };
    const heightOf = (i: number): number => {
      const top = instance.offsetOf(i);
      const bottom = i + 1 < instance.length ? instance.offsetOf(i + 1) : instance.totalHeight();
      return Math.max(0, bottom - top);
    };
    const visLo = center - 200;
    const visHi = center + vh + 200;
    const intersectsViewport = (i: number): boolean => {
      const top = instance.offsetOf(i);
      const bottom = i + 1 < instance.length ? instance.offsetOf(i + 1) : top + vh;
      return bottom > visLo && top < visHi;
    };
    // The transcript TOP (scroll-to-top landing) is a small fixed set that must
    // bind on every allocate regardless of budget — the tighter switch budget
    // below would otherwise starve it (it sorts farthest from the bottom
    // anchor). Exempt it like the viewport.
    const inTopLanding = (i: number): boolean => instance.offsetOf(i) < vh * 1.5;
    let assigned = 0;
    let spentPx = 0;
    let starved = false;
    let starvedNear = false;
    let scan = 0;
    let grewPool = false;
    for (const i of fresh) {
      const over = assigned >= cap || spentPx >= budgetPx;
      if (over && (hopeless || (!intersectsViewport(i) && (coldMount || !inTopLanding(i))))) {
        starved = true;
        if (inNearWindow(i) || (alsoCover !== undefined && Math.abs(instance.offsetOf(i) - alsoCover) < vh * 2))
          starvedNear = true;
        continue;
      }
      let slot = -1;
      while (scan < poolSizeRef.current) {
        if (!used.has(scan)) {
          const holder = slotToKey.get(scan);
          if (holder === undefined || !needKeys.has(holder)) {
            slot = scan;
            break;
          }
        }
        scan++;
      }
      if (slot < 0) {
        slot = poolSizeRef.current;
        poolSizeRef.current = slot + Math.max(16, fresh.length - assigned);
        slotStore.ensure(poolSizeRef.current);
        grewPool = true;
      }
      put(slot, i);
      assigned++;
      spentPx += heightOf(i);
      scan++;
    }
    if (grewPool) setPoolSize(poolSizeRef.current);
    // Starved rows drain on a follow-up pass: without one, a scroll that
    // SETTLES before its window is bound has no further events to finish the
    // job — the screen stays bare until the next input. Each pass binds
    // another budget's worth as soon as JS is free; rAF self-paces behind
    // the commits the previous pass scheduled. A render-phase caller can't
    // schedule from here (side effect in render) — it flags the layout
    // effect instead.
    if (starved) {
      if (notify) scheduleDrainRef.current?.(starvedNear);
      else {
        renderStarvedRef.current = true;
        renderStarvedNearRef.current ||= starvedNear;
      }
    }
    // Resident (out-of-window) slots: during PURE SCROLL (notify path) they're
    // untouched — offsets are static, so they sit at their true positions and
    // make any return to them instant. On a RENDER-phase allocate
    // (data/heights changed) REFRESH their offsets — heights above them may
    // have shifted and a wrong-top row could drift into view — and clear only
    // rows that left the data set. Mostly no-op sets (item + top unchanged),
    // so this is cheap per commit.
    if (!notify) {
      for (const [key, s] of [...nextMap]) {
        if (used.has(s)) continue;
        const idx = instance.indexOfKey(key);
        if (idx === undefined) {
          const changed = slotStore.set(s, null, false);
          if (changed) dirtySlotsRef.current.add(s);
          nextMap.delete(key);
        } else {
          const changed = slotStore.set(
            s,
            {
              rowKey: key,
              item: instance.itemAt(idx),
              top: origin + instance.offsetOf(idx),
              cw,
              centered,
            },
            false,
          );
          if (changed) dirtySlotsRef.current.add(s);
        }
      }
    }
    rowToSlotRef.current = nextMap;
  };

  // Two drain cadences. NEAR starvation (the scroll window or a fling
  // landing) drains on rAF — it's what recovers a blank viewport. FAR-only
  // starvation (the resident top block after a fresh open) waits for idle:
  // draining it immediately stacks heavy commits onto the open/navigation
  // animation, which reads as a laggy session switch.
  const runDrain = (): void => {
    allocateRef.current?.(
      instance.scrollTop,
      true,
      Math.abs(velocityRef.current) > 2500 ? projectedRef.current : undefined,
    );
    // Refine estimated heights at a yielding cadence (a frame's worth of
    // measuring, then the thread is free) until the whole chat is exact —
    // after which the engine behaves exactly like a fully pre-measured one.
    if (instance.estimatedCount() > 0 && refineTimerRef.current === null) {
      const pump = (): void => {
        refineTimerRef.current = null;
        // Refines shift offsets through the anchor channel — hold while a
        // wormhole's corridor depends on them; retry after it lands.
        if (wormholeRef.current !== null) {
          refineTimerRef.current = setTimeout(pump, 120);
          return;
        }
        const remaining = instance.refineEstimates(10);
        if (remaining > 0) refineTimerRef.current = setTimeout(pump, 60);
      };
      refineTimerRef.current = setTimeout(pump, 60);
    }
  };
  scheduleDrainRef.current = (near: boolean) => {
    if (drainScheduledRef.current) return;
    if (near) {
      drainScheduledRef.current = true;
      requestAnimationFrame(() => {
        drainScheduledRef.current = false;
        runDrain();
      });
    } else if (idleDrainTimerRef.current === null) {
      idleDrainTimerRef.current = setTimeout(() => {
        idleDrainTimerRef.current = null;
        runDrain();
      }, 700);
    }
  };
  allocateRef.current = allocate;

  // The slot elements are memoized on pool size: hundreds of slots re-created
  // per list render made EVERY streaming/data commit walk 800+ fibers just to
  // bail out. Same element identity lets React skip unchanged slots entirely
  // — a list re-render costs O(changed slots), not O(pool).
  const slotChildren = useMemo(
    () =>
      Array.from({ length: poolSize }, (_, s) => (
        <Slot key={s} store={slotStore} id={s} instance={instance} />
      )),
    [poolSize, slotStore, instance],
  );

  // Deliver render-phase slot reassignments AFTER the commit. Calling a slot's
  // subscribers during MugenVList's render is a cross-component setState in
  // render (React: "Cannot update a component (`Slot`) while rendering a
  // different component"); a layout effect fires synchronously post-commit,
  // pre-paint — the woken slots reconcile within the same frame. Slots that
  // MOUNT this commit read the store directly and won't be dirty-notified
  // redundantly (the notify is a version poke; an unchanged snapshot no-ops).
  useLayoutEffect(() => {
    // Deliver notifications a render-phase refine had to suppress (see
    // allocate): post-commit, waking subscribers is legal again.
    if (pendingSilentRefineRef.current) {
      pendingSilentRefineRef.current = false;
      instance.flushNotifications();
    }
    // Estimated heights refine in idle time from the first commit on.
    if (instance.estimatedCount() > 0) scheduleDrainRef.current?.(false);
    // A render-phase allocate that hit its budget finishes post-commit.
    if (renderStarvedRef.current) {
      const near = renderStarvedNearRef.current;
      renderStarvedRef.current = false;
      renderStarvedNearRef.current = false;
      scheduleDrainRef.current?.(near);
    }
    if (dirtySlotsRef.current.size === 0) return;
    // Wake every slot the render-phase allocate reassigned. This set is already
    // BOUNDED by the render-path bind budget (~1.2 viewports on a data swap, see
    // allocate), plus the cheap cleared/refreshed old slots (null → RowView
    // returns null; offset-only refresh → a light re-render). Waking them all
    // in one post-commit pass is both correct — the visible rows MUST repaint
    // with the new chat's content — and small; an earlier attempt to defer
    // "offscreen" wakes gated visibility on `adapter.scrollTop`, which on a
    // switch still holds the OLD position (initialScroll re-anchors after this
    // effect), so the true-visible rows were misjudged offscreen and never
    // repainted — the "switching shows the previous chat" bug. The overscan
    // beyond the budget is STARVED (never dirtied here) and fills through the
    // drain, so this stays bounded without visibility guessing.
    const ids = [...dirtySlotsRef.current.keys()];
    dirtySlotsRef.current.clear();
    for (const id of ids) slotStore.notify(id);
  });

  const rows: ReactNode[] = [];
  if (resident && instance.length > 0 && vh > 0 && cw > 0) {
    for (let i = 0; i < instance.length; i++) {
      const key = instance.keyAt(i);
      rows.push(
        <RowView
          key={key}
          instance={instance}
          rowKey={key}
          item={instance.itemAt(i)}
          top={originRef.current + instance.offsetOf(i)}
          cw={cw}
          centered={centered}
        />,
      );
    }
  } else if (instance.length > 0 && vh > 0 && cw > 0) {
    // Re-seed the pool for the current position (SILENT — notifying here would
    // setState the memoized Slots during MugenVList's render, which React
    // forbids; the layout effect above wakes exactly the changed slots right
    // after commit, e.g. a streaming row whose content grew). Freshly-mounted
    // slots read the store directly this commit. Scroll updates go through
    // `allocate(st, true)` in onScroll, where an immediate notify is legal.
    allocate(adapter.scrollTop, false);
    rows.push(slotChildren);
  }

  // Reach callbacks fire inline from onScroll (the recycling path doesn't
  // re-render the list per scroll, so a scrollTop-effect wouldn't run).

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
      <View style={slotStyle(originRef.current)}>
        <View style={{ width: cw }}>
          <WidthContext.Provider value={cw}>{props.renderTop()}</WidthContext.Provider>
        </View>
      </View>
    ) : null;

  const bottomSlot =
    props.renderBottom && cw > 0 ? (
      <View style={slotStyle(originRef.current + bottomSlotTop)}>
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
    const st = e.nativeEvent.contentOffset.y - originRef.current;
    const now = performance.now();
    // Wormhole in flight: the corridor is pre-painted at temporary tops —
    // normal allocation would rebind it to real positions mid-glide. Just
    // watch for arrival.
    const w = wormholeRef.current;
    if (w !== null) {
      adapter.onNativeScroll(st);
      pokeIndicator();
      if (Math.abs(st - w.glideTo) < 3) wormholeFinishRef.current?.();
      return;
    }
    const lastSample = scrollSampleRef.current;
    if (lastSample !== null && now - lastSample.t >= 8 && now - lastProgWriteRef.current > 120) {
      // Smoothed px/s — drives the directional overscan lead. Samples closer
      // than ~half a frame are a queue drain after a JS stall (coalesced
      // events processed back-to-back): position deltas of thousands of px
      // over ~2ms read as millions of px/s and poison every velocity-gated
      // decision downstream. Samples straddling a programmatic write are a
      // jump, not motion. Only wall-clock-meaningful physical samples update
      // the estimate, clamped well above finger momentum but low enough to
      // stay meaningful.
      const inst = ((st - lastSample.y) / (now - lastSample.t)) * 1000;
      const mixed = velocityRef.current * 0.5 + inst * 0.5;
      velocityRef.current = Math.max(-150_000, Math.min(150_000, mixed));
    }
    scrollSampleRef.current = { t: now, y: st };
    // A staged correction landed (or the user scrolled) — drop transition state.
    setPendingAnchor((cur) => (cur === null ? cur : null));
    setPendingJump((cur) => (cur === null ? cur : null));
    adapter.onNativeScroll(st);
    instance.setScrollTop(st); // updates scrollTop + wakes useMugenSelector
    pokeIndicator();
    // Reassign pool slots directly — NO list re-render, no row mount/unmount.
    // Only slots a row entered or left re-render, each reusing its RowView
    // fiber. Rows still in view are untouched. Resident mode keeps everything
    // mounted and needs nothing here.
    if (Number.isFinite(props.overscan ?? 200)) {
      // CONTINUOUS LANDING PROJECTION. iOS momentum is deterministic — from
      // the live measured velocity, the stopping point is st + v·r/(1−r)
      // (r = 0.998/ms). Re-aim every event: chained flings ACCUMULATE
      // momentum far beyond any single drag's release velocity, so only the
      // live velocity sees the true destination. The landing zone stays bound
      // through the whole deceleration (it's covered by every allocate), and
      // pretext's exact offsets identify precisely which rows sit there.
      const vms = velocityRef.current / 1000; // px/ms
      let projected: number | undefined;
      if (Math.abs(vms) > 2.5) {
        const travel = (vms * 0.998) / 0.002;
        const maxSt = Math.max(0, instance.totalHeight() - vh);
        const dest = Math.max(0, Math.min(st + travel, maxSt));
        if (Math.abs(dest - st) > vh) projected = dest;
      }
      projectedRef.current = projected;
      allocateRef.current?.(st, true, projected);
    }
    if (props.onTopReached || props.onBottomReached) {
      const topT = Math.max(0, props.topReachedThreshold ?? 0);
      const botT = Math.max(0, props.bottomReachedThreshold ?? 0);
      if (st <= topT) {
        if (props.onTopReached && reachedRef.current.top !== topEdgeKey) {
          props.onTopReached(instance.length === 0 ? -1 : 0);
          reachedRef.current.top = topEdgeKey;
        }
      } else reachedRef.current.top = null;
      if (st + vh >= total - botT) {
        if (props.onBottomReached && reachedRef.current.bottom !== bottomEdgeKey) {
          props.onBottomReached(instance.length === 0 ? -1 : instance.length - 1);
          reachedRef.current.bottom = bottomEdgeKey;
        }
      } else reachedRef.current.bottom = null;
    }
    if (stickOn) ctl.handleScroll(stickThreshold);
  };

  // Indicator geometry — exact, from the engine's totals. Proportion is
  // vh/total; position maps the canvas offset range onto the track. Both
  // recompute on every commit (heights/origin changes), while per-frame
  // position runs natively off `indicatorY`.
  const indicator = (() => {
    if (props.showsVerticalScrollIndicator === false) return null;
    if (vh <= 0 || total <= vh + 1) return null;
    const trackPad = 2;
    // Inset the track below the floating header and above the composer, so the
    // bar sits between them (content still scrolls full-height underneath).
    const insetTop = Math.max(0, props.scrollIndicatorInsets?.top ?? 0);
    const insetBottom = Math.max(0, props.scrollIndicatorInsets?.bottom ?? 0);
    const trackTop = insetTop + trackPad;
    const trackLen = Math.max(0, vh - insetTop - insetBottom - trackPad * 2);
    if (trackLen <= 0) return null;
    const barH = Math.min(trackLen, Math.max(36, (vh / total) * trackLen));
    const origin = originRef.current;
    return (
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          right: 3,
          top: 0,
          width: 3,
          height: barH,
          borderRadius: 1.5,
          backgroundColor: 'rgba(150, 150, 150, 0.65)',
          opacity: indicatorOpacity,
          transform: [
            {
              translateY: indicatorY.interpolate({
                inputRange: [origin, origin + (total - vh)],
                outputRange: [trackTop, trackTop + trackLen - barH],
                extrapolate: 'clamp',
              }),
            },
          ],
        }}
      />
    );
  })();

  return (
    <View
      onLayout={controlledWidth != null && props.height != null ? undefined : onLayout}
      style={[props.height != null ? { height: props.height, flexGrow: 0 } : { flex: 1 }, props.style]}
    >
      <Animated.ScrollView
        // Animated.ScrollView forwards the host ref; at runtime this receives
        // the plain ScrollView instance (scrollTo works). The cast bridges the
        // AnimatedComponent wrapper's ref typing.
        ref={scrollViewRef as never}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: indicatorY } } }], {
          useNativeDriver: true,
          listener: onScroll as (e: NativeSyntheticEvent<NativeScrollEvent>) => void,
        })}
        scrollEventThrottle={16}
        // Break the stick from user *input* at FINGER-DOWN, like the web host's
        // touchstart/touchend pair. Drag begin/end alone is too late: a tap on a
        // row control never becomes a drag, so while the spring is warm (during
        // a stream and its settle grace) each frame's programmatic scrollTo
        // moves the content under the finger and the OS cancels the child press
        // — taps on collapse toggles do nothing until a drag stops the spring.
        onTouchStart={stickOn ? () => ctl.handleTouchStart() : undefined}
        onTouchEnd={stickOn ? () => ctl.handleTouchEnd(stickThreshold) : undefined}
        // A recognized drag CANCELS the JS touch (no onTouchEnd); close out the
        // pointer so handleScroll's non-pointer bookkeeping takes over. When the
        // drag handlers below also fire, their touchStart/touchEnd pair simply
        // recomputes the same state — the calls are idempotent.
        onTouchCancel={stickOn ? () => ctl.handleTouchEnd(stickThreshold) : undefined}
        onScrollBeginDrag={() => {
          // A finger interrupts a wormhole: normalize immediately (identical
          // pixels — the drag continues from exactly what's on screen).
          if (wormholeRef.current !== null) wormholeFinishRef.current?.();
          indicatorPokeUntilRef.current = Number.MAX_SAFE_INTEGER;
          if (stickOn) ctl.handleTouchStart();
        }}
        onScrollEndDrag={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
          indicatorPokeUntilRef.current = performance.now() + 2500; // momentum window
          if (stickOn) ctl.handleTouchEnd(stickThreshold);
        }}
        // mugen does its own scroll anchoring; the platform's would double-adjust.
        maintainVisibleContentPosition={undefined}
        removeClippedSubviews={false}
        // The list stays the scrollsToTop candidate (iOS only consults the
        // delegate for candidates); the app's native intercept answers the
        // tap by DECLINING the system flight and driving
        // `instance.scrollToTop()` instead (see scrollToTopDriver). Pooled
        // (hidden) panes must opt OUT via `scrollsToTop={false}` or iOS
        // ignores the tap entirely.
        scrollsToTop={props.scrollsToTop ?? true}
        testID={props.testID}
        keyboardDismissMode={props.keyboardDismissMode}
        keyboardShouldPersistTaps={props.keyboardShouldPersistTaps}
        // Always off: mugen draws its own (see showsVerticalScrollIndicator doc).
        showsVerticalScrollIndicator={false}
        // Mount-time anchor in canvas coordinates (Fabric honors contentOffset
        // only at mount; later corrections use origin absorption instead).
        contentOffset={anchorOffsetRef.current ?? undefined}
        // The occupied region of the headroom canvas — clamps scrolling so the
        // unused space above the oldest row is unreachable.
        contentInset={
          CANVAS_HEADROOM > 0
            ? { top: -originRef.current, left: 0, bottom: 0, right: 0 }
            : undefined
        }
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
        style={{ flex: 1 }}
      >
        <View
          // Counter-translation while a corrective anchor scroll is in flight:
          // the taller canvas paints pixel-identically at the stale offset.
          // Cleared by the scroll's own onScroll. (A conditional entry, not a
          // `transform: undefined` key — RN's style validator rejects that.)
          style={[
            { height: originRef.current + total, width: '100%' },
            pendingAnchor !== null ? { transform: [{ translateY: -pendingAnchor.delta }] } : null,
          ]}
        >
          <TextDefaultsContext.Provider value={defaults}>
            {topSlot}
            {rows}
            {bottomSlot}
          </TextDefaultsContext.Provider>
        </View>
      </Animated.ScrollView>
      {indicator}
    </View>
  );
}
