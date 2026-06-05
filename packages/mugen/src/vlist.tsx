import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import { MugenInstance } from './instance';
import { withSession, type MugenSession } from './session';
import { TextDefaultsContext, type TextDefaults } from './text-defaults';
import type { Font, WhiteSpaceMode, WordBreakMode } from './text-defaults';
import { rootFontSizePx } from './tokens-resolve';
import { subscribeFonts, watchFonts } from './pretext/fonts';

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
  /** Override the measured viewport width (tests/SSR); skips the ResizeObserver. */
  width?: number;
  /** Extra px rendered above/below the viewport. Default 200. */
  overscan?: number;
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
      <div style={{ width: centered ? `${cw}px` : '100%', maxWidth: `${cw}px` }}>{tree}</div>
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
  instance.configure({ getKey, render, defaults, maxW: props.maxW });
  instance.setViewport(vw, vh, rootPx);
  instance.sync();

  const total = instance.totalHeight();
  const overscan = props.overscan ?? 200;
  const cw = instance.contentWidth();
  const centered = instance.isCentered();

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

  return (
    <div
      ref={scrollRef}
      className={props.className}
      onScroll={(e) => {
        const st = e.currentTarget.scrollTop;
        instance.scrollTop = st;
        setScrollTop(st);
      }}
      style={{
        position: 'relative',
        overflowY: 'auto',
        overflowX: 'hidden',
        height: props.height != null ? `${props.height}px` : '100%',
        ...props.style,
      }}
    >
      <div style={{ position: 'relative', height: `${total}px`, width: '100%' }}>
        <TextDefaultsContext.Provider value={defaults}>{rows}</TextDefaultsContext.Provider>
      </div>
    </div>
  );
}
