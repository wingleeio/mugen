import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import { MugenInstance, type MugenScrollAlign } from './instance';
import { RowScopeContext } from './row-scope';
import { withSession, type MugenSession } from './session';
import { TextDefaultsContext, type TextDefaults } from './text-defaults';
import type { Font, WhiteSpaceMode, WordBreakMode } from './text-defaults';
import { rootFontSizePx } from './tokens-resolve';
import { fontEpoch, subscribeFonts, watchFonts } from './pretext/fonts';
import {
  ScrollController,
  DEFAULT_SPRING,
  STICK_THRESHOLD_PX,
  setScrollTopInstant,
  type MugenScrollEase,
  type SpringOptions,
} from './scroll-controller';

// useLayoutEffect on the client (run before paint so the initial scroll doesn't
// flash), useEffect on the server (avoid the SSR warning; it no-ops there).
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

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
      /** `'instant'` (default) jumps; `'smooth'` uses native smooth scrolling. */
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
 * Create (and own, across renders) a list instance for `items`. Pass the
 * returned instance to `<MugenVList>`; call `instance.scrollToItem(key)` to
 * scroll. The item type is inferred from `items` — `useMugenVirtualizer<T>(…)`
 * to set it explicitly.
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
  /** Viewport height in px. Defaults to filling the parent (`100%`). */
  height?: number;
  /**
   * Where to place the scroll on first measure. `'bottom'` opens the list at
   * the end (e.g. a chat at the latest message); `'top'` (default) at the
   * start. Pass an object to animate it in, or to start at an item index.
   * Applied once.
   */
  initialScroll?: 'top' | 'bottom' | InitialScrollOptions;
  /**
   * Keep the list pinned to the bottom as content grows — for streaming chat.
   * `true` uses a smooth spring; the user scrolling up interrupts it, and
   * returning to the bottom re-engages. Pass an object to tune the spring.
   */
  stickToBottom?: boolean | StickToBottomOptions;
  /** Override the measured viewport width (tests/SSR); skips the ResizeObserver. */
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
  className?: string;
  style?: CSSProperties;
}

// One memoized row wrapper. Re-renders only when its own props change (its top
// offset, item, width) or its slot state changes (it subscribes to its row
// version), so toggling one row doesn't re-render rows above it.
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
    <div
      data-mugen-row={rowKey}
      style={{
        position: 'absolute',
        top: `${top}px`,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: centered ? 'center' : 'stretch',
      }}
    >
      <div style={{ width: centered ? `${cw}px` : '100%', maxWidth: `${cw}px` }}>
        {/* One frozen scope object per row — the value never changes identity,
            so this provider never causes context re-renders; it exists purely
            so useMugenRow can resolve (host, rowKey) in nested components. */}
        <RowScopeContext.Provider value={instance.scopeRef(rowKey)}>{tree}</RowScopeContext.Provider>
      </div>
    </div>
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
 * The list component. Provides the instance's text defaults to `Text`, windows
 * the data, and renders only the visible slice — each row authored by `render`
 * as a primitive tree.
 */
export function MugenVList<T>(props: MugenVListProps<T>): ReactElement {
  const { instance, getKey, render } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const measured = useRef<{ width: number; height: number }>({ width: 0, height: 0 });

  // Re-render whenever any row is invalidated. useSyncExternalStore (not a
  // subscribe-in-effect) so changes during a child's mount still re-render.
  const subscribeGlobal = useCallback((cb: () => void) => instance.subscribeGlobal(cb), [instance]);
  const getGlobalVersion = useCallback(() => instance.globalVersion(), [instance]);
  useSyncExternalStore(subscribeGlobal, getGlobalVersion, getGlobalVersion);

  const controlledWidth = props.width;

  // Viewport size via one ResizeObserver on the scroll element.
  useEffect(() => {
    if (controlledWidth != null) return;
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      measured.current = { width: cr.width, height: cr.height };
      instance.notifyGlobal();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [controlledWidth, instance]);

  // Wire the scroll element + re-anchoring for off-screen height changes.
  useEffect(() => {
    instance.attachScroller(scrollRef.current);
    instance.scrollAnchor = (delta: number) => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTop += delta;
      instance.scrollTop = el.scrollTop;
      setScrollTop(el.scrollTop);
    };
    return () => {
      instance.attachScroller(null);
      instance.scrollAnchor = null;
    };
  }, [instance]);

  // Re-measure everything once web fonts settle.
  useEffect(() => {
    watchFonts();
    return subscribeFonts(() => instance.remeasure());
  }, [instance]);

  // ── Scroll controller: initialScroll + stickToBottom (smooth spring) ──
  const ctlRef = useRef<ScrollController | null>(null);
  if (ctlRef.current === null) ctlRef.current = new ScrollController();
  const ctl = ctlRef.current;
  useEffect(() => () => ctl.attach(null), [ctl]); // stop the animation on unmount

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
    const el = scrollRef.current;
    if (!el) return;
    instance.scrollTop = el.scrollTop;
    setScrollTop(el.scrollTop);
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

  // Back `instance.scrollToBottom()` with the controller so it re-engages the
  // stick and (for `smooth`) springs to the bottom while re-targeting it every
  // frame — landing on the current bottom of a streaming list instead of the
  // stale one a native `scrollTo` aims at.
  instance.scrollToBottomDriver = (behavior) => {
    const el = scrollRef.current;
    if (!el) return;
    ctl.attach(el);
    ctl.escaped = false;
    if (behavior === 'smooth') ctl.springToBottom(stickSpring);
    else {
      ctl.jumpToBottom();
      syncWindowFromEl();
    }
  };

  // If a route/page reuses the same mounted list component for a different data
  // set, `initialScroll` should apply to the new page too. Appends and prepends
  // preserve one edge key, so keep their normal scroll anchoring/stick behavior.
  useIsoLayoutEffect(() => {
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
      (prev.length > 0 &&
        next.length > 0 &&
        prev.first !== next.first &&
        prev.last !== next.last);
    if (!replaced) return;
    didInitialScroll.current = false;
    prevTotalRef.current = -1;
    ctl.stop();
  });

  // Apply `initialScroll` once, after the first real measure (content width and
  // total height are only known after the ResizeObserver fires).
  useIsoLayoutEffect(() => {
    if (didInitialScroll.current) return;
    const el = scrollRef.current;
    if (!el) return;
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
        el.scrollTo({ top: target, behavior: 'smooth' });
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

  // Keep pinned to the bottom as content grows. Crucially this reacts only to
  // the content *growing* — never to a plain re-render (a scroll updating state,
  // a row toggling). That mirrors use-stick-to-bottom's ResizeObserver: without
  // it the spring would fire on the user's own scroll and yank them back even
  // when nothing streamed. No-op once the user has escaped.
  useIsoLayoutEffect(() => {
    const el = scrollRef.current;
    if (!stickOn || !didInitialScroll.current || !el) return;
    ctl.attach(el);
    // A font-settle re-measure or a viewport resize reflows *every* row at once
    // (fallback metrics → the real web font; a new width → new wrapping), so the
    // total height jumps. Snap to those instantly — animating a whole-layout
    // correction reads as a janky "scroll to bottom" — rather than springing as
    // we do for content that genuinely streams in.
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
    if (prevTotal < 0) return; // first run after initialScroll: record the baseline only
    if (total <= prevTotal + 0.5) return; // not growth → leave the user where they are
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
  const rootPx = rootFontSizePx();
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

  const reachedRef = useRef<{ top: string | null; bottom: string | null }>({
    top: null,
    bottom: null,
  });

  // Apply the pending scroll-anchor shift in a layout effect (post-commit), not
  // during render. `sync()` queues the delta on the instance; consuming it here
  // — rather than reading it during render — keeps it intact when React invokes
  // the render function more than once before committing (concurrent re-render),
  // which would otherwise drop the shift and let prepended content pin the
  // viewport at the top, re-triggering `onTopReached` in a loop.
  useIsoLayoutEffect(() => {
    const scrollAnchorDelta = instance.takeScrollAnchorDelta();
    if (scrollAnchorDelta === 0) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop += scrollAnchorDelta;
    instance.scrollTop = el.scrollTop;
    setScrollTop(el.scrollTop);
    // A re-anchored items change preserves visual continuity, so whatever rows
    // now sit at the edges were not freshly *reached* — mark them handled. The
    // browser can clamp or override the scrollTop write (an active touchpad
    // gesture holding the top edge); without this, a prepend would leave the
    // viewport pinned at the top with a new first key and immediately re-fire
    // `onTopReached` — a double page load from one gesture. When the list
    // can't scroll at all (content shorter than the viewport), the edge keys
    // stay unmarked so reach callbacks keep chaining to fill the viewport.
    if (instance.totalHeight() > vh + 1 && instance.length > 0) {
      reachedRef.current.top = instance.keyAt(0);
      reachedRef.current.bottom = instance.keyAt(instance.length - 1);
    }
  });

  const total = instance.totalHeight();
  const overscan = props.overscan ?? 200;
  const cw = instance.contentWidth();
  const centered = instance.isCentered();
  const topSlotHeight = instance.topHeight();
  const bottomSlotTop = topSlotHeight + instance.itemsHeight();
  const topEdgeKey = instance.length === 0 ? '__empty__' : instance.keyAt(0);
  const bottomEdgeKey =
    instance.length === 0 ? '__empty__' : instance.keyAt(instance.length - 1);

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
    const el = scrollRef.current;
    if (!el || vh <= 0) return;

    const st = el.scrollTop;
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

  const topSlot =
    props.renderTop && cw > 0 ? (
      <div
        data-mugen-top=""
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: centered ? 'center' : 'stretch',
        }}
      >
        <div style={{ width: centered ? `${cw}px` : '100%', maxWidth: `${cw}px` }}>
          {props.renderTop()}
        </div>
      </div>
    ) : null;

  const bottomSlot =
    props.renderBottom && cw > 0 ? (
      <div
        data-mugen-bottom=""
        style={{
          position: 'absolute',
          top: `${bottomSlotTop}px`,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: centered ? 'center' : 'stretch',
        }}
      >
        <div style={{ width: centered ? `${cw}px` : '100%', maxWidth: `${cw}px` }}>
          {props.renderBottom()}
        </div>
      </div>
    ) : null;

  return (
    <div
      ref={scrollRef}
      className={props.className}
      onScroll={(e) => {
        const st = e.currentTarget.scrollTop;
        instance.setScrollTop(st); // updates scrollTop + wakes useMugenSelector
        setScrollTop(st);
        if (stickOn) ctl.handleScroll(stickThreshold);
      }}
      // Break the stick from user *input* — reliable even while the spring is
      // still writing scrollTop every frame during a stream.
      onWheel={stickOn ? (e) => ctl.handleWheel(e.deltaY) : undefined}
      onTouchStart={stickOn ? () => ctl.handleTouchStart() : undefined}
      onTouchEnd={stickOn ? () => ctl.handleTouchEnd(stickThreshold) : undefined}
      style={{
        position: 'relative',
        overflowY: 'auto',
        overflowX: 'hidden',
        // mugen does its own scroll anchoring (prepend compensation, the
        // stick-to-bottom spring); native scroll anchoring reacting to the
        // same height changes would double-adjust scrollTop and jitter.
        overflowAnchor: 'none',
        height: props.height != null ? `${props.height}px` : '100%',
        ...props.style,
      }}
    >
      <div style={{ position: 'relative', height: `${total}px`, width: '100%' }}>
        <TextDefaultsContext.Provider value={defaults}>
          {topSlot}
          {rows}
          {bottomSlot}
        </TextDefaultsContext.Provider>
      </div>
    </div>
  );
}
