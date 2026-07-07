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
  // Slots reassigned during a RENDER-phase allocate; woken post-commit.
  const dirtySlotsRef = useRef<Set<number>>(new Set());

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
  adapter.onProgrammaticWrite = (next, prev) => {
    instance.scrollTop = next;
    setScrollTop(next);
    if (Math.abs(next - prev) <= overscanRef.current) return false;
    // Big jump: paint BOTH the departure and destination windows in one
    // commit, so neither ordering of (scroll command, commit) can show bare
    // canvas. The landing onScroll drops the departure window.
    setPendingJump({ from: prev, to: next });
    return true;
  };

  useLayoutEffect(() => {
    if (pendingJump !== null) adapter.scrollFn?.(pendingJump.to, false);
  }, [pendingJump, adapter]);

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

    // Priority: the NEAR FIELD first — what the viewport is about to cross
    // must bind before it arrives; the projected landing zone is merely
    // INCLUDED in `need` (protected from eviction, filled with each event's
    // leftover budget across the ~1s of transit). Anchoring the sort at the
    // far destination instead starves the near field and blanks the transit.
    const anchor = center + vh / 2 + Math.max(-900, Math.min(900, v * 0.08));
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

    const put = (slot: number, i: number): void => {
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
    // nearest-to-destination first, at most FRESH_PER_EVENT per scroll event:
    // one rebind is a markdown reconcile (~5-15ms on Hermes) and an unbounded
    // batch is one long commit — the hitch that lets the viewport outrun the
    // window. Rows INTERSECTING the viewport bypass the budget: if a fling
    // lands in unbound territory, what the user is looking at binds NOW.
    // 6 balances rebind throughput against event starvation; at extreme
    // velocity each processed event carries a huge delta anyway, so a larger
    // batch raises net throughput instead of starving events.
    const FRESH_PER_EVENT = Math.abs(v) > 8000 ? 10 : 6;
    const cap = notify ? FRESH_PER_EVENT : Number.POSITIVE_INFINITY;
    const visLo = center - 200;
    const visHi = center + vh + 200;
    const intersectsViewport = (i: number): boolean => {
      const top = instance.offsetOf(i);
      const bottom = i + 1 < instance.length ? instance.offsetOf(i + 1) : top + vh;
      return bottom > visLo && top < visHi;
    };
    let assigned = 0;
    let scan = 0;
    let grewPool = false;
    for (const i of fresh) {
      if (assigned >= cap && !intersectsViewport(i)) continue;
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
      scan++;
    }
    if (grewPool) setPoolSize(poolSizeRef.current);
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
    if (dirtySlotsRef.current.size === 0) return;
    const ids = [...dirtySlotsRef.current];
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
    const lastSample = scrollSampleRef.current;
    if (lastSample !== null && now > lastSample.t) {
      // Smoothed px/s — drives the directional overscan lead.
      const inst = ((st - lastSample.y) / (now - lastSample.t)) * 1000;
      velocityRef.current = velocityRef.current * 0.5 + inst * 0.5;
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
        // Break the stick from user *input* — a drag is the RN analog of the web's
        // touchstart/touchend pair (wheel has no mobile equivalent). Drags also
        // arm the scroll indicator (programmatic motion never shows it).
        onScrollBeginDrag={() => {
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
