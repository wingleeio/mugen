import type { ReactNode } from 'react';
import { OffsetIndex } from './offset/offset-index';
import { runInert } from './state/dispatcher';
import {
  AnimationClock,
  canAnimate,
  resolveEasing,
  DEFAULT_TWEEN_MS,
  type MugenTweenOptions,
  type TweenState,
} from './state/clock';
import { heightOf } from './walker';
import { contentWidth, resolveMaxWidthPx } from './tokens-resolve';
import { withSession, currentSession, type MugenSession, type SessionMode, type SlotHost } from './session';
import type { RowScopeRef } from './row-scope';
import type { EffectCleanup } from './hooks';
import type { TextDefaults } from './text-defaults';

export type MugenScrollBehavior = 'auto' | 'smooth';
export type MugenScrollAlign = 'auto' | 'start' | 'center' | 'end';

export interface ScrollToOptions {
  behavior?: MugenScrollBehavior;
  /** Where to land the row in the viewport. `auto` scrolls the least. */
  align?: MugenScrollAlign;
}

/** Reactive viewport/scroll state, read with `useMugenSelector`. */
export interface MugenScrollState {
  /** Current scroll offset from the top, in px. */
  scrollTop: number;
  /** Height of the scroll viewport, in px. */
  viewportHeight: number;
  /** Total scrollable content height, including top/bottom slots, in px. */
  totalHeight: number;
  /** Distance from the bottom, in px (0 = pinned to the bottom). */
  distanceFromBottom: number;
}

/** Render-time config fed by `<MugenVList>`. */
export interface MugenConfig<T> {
  getKey: (item: T, index: number) => string;
  render: (item: T) => ReactNode;
  renderTop?: () => ReactNode;
  renderBottom?: () => ReactNode;
  defaults: TextDefaults;
  maxW?: number | string;
}

/**
 * A persistent height store the host app can plug in (`instance.heightCache`).
 * Heights are pure functions of (row content, content width, font tables), so
 * an app with stable row keys can persist them across instances — and across
 * process launches — and a list then opens with every offset known without
 * walking a single row. The cache is consulted only for rows this instance has
 * never measured; rows whose slot state has diverged from default (a fold
 * toggled open) re-measure live and are NEVER written back, so the store only
 * ever holds default-state heights. The app owns invalidation: the key it
 * derives must change when the row's content, the content width, or the font
 * set changes (compose those into the storage key).
 */
export interface MugenHeightCache {
  get(key: string, width: number): number | undefined;
  set(key: string, width: number, height: number): void;
}

// ── Per-row slot store (the home for useMugenState/Memo/Effect) ──────────────

interface StateSlot {
  kind: 'state';
  value: unknown;
}
interface MemoSlot {
  kind: 'memo';
  value: unknown;
  deps: readonly unknown[];
}
interface EffectSlot {
  kind: 'effect';
  deps: readonly unknown[] | null;
  cleanup?: EffectCleanup;
  pending: object | null;
}
interface TweenSlot extends TweenState {
  kind: 'tween';
  /** `Collapse` only: the last `open` it saw, to tell a toggle from content growth. */
  lastOpen?: boolean;
}
type Slot = StateSlot | MemoSlot | EffectSlot | TweenSlot;

interface RowRecord {
  item: unknown;
  slots: Slot[];
  /** Scoped slots (`useMugenRow`, tweens) — keyed, so nested components can
   *  address them from both the measure walk and the React render. They live
   *  until the row is removed (there is no per-pass trim for scopes). */
  keyed: Map<string, Slot>;
  /** Bumped on every keyed-slot write and tween frame. Folded into the
   *  walker's element-identity height memo, so a memo-stable ancestor element
   *  can't serve a stale height over a changed nested slot. */
  slotEpoch: number;
  /** The stable per-row handle `RowScopeContext` provides (created lazily). */
  scope: RowScopeRef | null;
  version: number;
  subs: Set<() => void>;
}

function shallowEqual(a: readonly unknown[] | null, b: readonly unknown[]): boolean {
  if (a == null || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
  return true;
}

function defaultsKey(d: TextDefaults): string {
  return [d.font, d.lineHeight, d.letterSpacing, d.whiteSpace, d.wordBreak].join('|');
}

/**
 * The non-React core of a list. Owns the item/key tables, the per-row slot store
 * (state/memo/effect), the Fenwick offset index, and the measurement walk. It is
 * `SlotHost`: the mugen hooks call into it through the ambient session.
 *
 * Created by `useMugenVirtualizer` (which feeds it `items`) and configured by
 * `<MugenVList>` (which feeds it `render`/`getKey`/defaults and drives the
 * viewport). The single height-changing path is `invalidate`, which re-measures
 * one row, patches the index, re-anchors scroll, and notifies subscribers.
 */
export class MugenInstance<T> implements SlotHost {
  private config: MugenConfig<T> | null = null;
  private items: T[] = [];
  private keys: string[] = [];
  private keyToIndex = new Map<string, number>();
  private rows = new Map<string, RowRecord>();
  private offset = new OffsetIndex();
  private topSlotHeight = 0;
  private bottomSlotHeight = 0;

  private viewportWidth = 0;
  private viewportHeight = 0;
  private rootPx = 16;

  private itemsDirty = false;
  private geometryDirty = false;
  private lastDefaultsKey = '';
  private lastMaxW: number | string | undefined;

  /** Optional persistent height store (see `MugenHeightCache`). */
  heightCache: MugenHeightCache | null = null;

  /**
   * Lazy measurement: on a full (re)measure, walk only the first `head` and
   * last `tail` rows for real; every other UNCACHED row receives the running
   * average as an ESTIMATE. Estimates refine incrementally via
   * `refineEstimates` (idle time) and `ensureMeasured` (the moment a row is
   * about to paint), with viewport-stability deltas flowing through the same
   * scroll-anchor channel as prepends — so a cold heavy transcript opens in
   * the time it takes to measure a few screens, not the whole history.
   * Rows with cache/memo hits are always exact; `null` disables laziness.
   */
  lazyMeasure: { head: number; tail: number } | null = null;
  private estimatedKeys = new Set<string>();
  /**
   * Per-instance height memo, keyed by row key and guarded by item identity —
   * the row-level analog of `React.memo`. Without it every `setItems` re-walks
   * EVERY row (each streamed append re-measures the whole transcript): free
   * under a JIT, ruinous on Hermes. With it an append is O(rows) map lookups
   * plus one real walk for the new row. `invalidate` (the one legitimate
   * height-changing path) overwrites its row's entry; geometry/font changes
   * clear the whole memo.
   */
  private heightMemo = new Map<string, { item: unknown; height: number }>();

  // Subscriptions: one global (the list windows on it) + one per row (RowView).
  private globalSubs = new Set<() => void>();
  private globalV = 0;

  // Scroll element, wired by the list. Used by scrollToItem and re-anchoring.
  private scrollEl: HTMLElement | null = null;
  private pendingScrollAnchorDelta = 0;
  /** Current scroll position, kept in sync by the list. */
  scrollTop = 0;
  /** Cached scroll-state snapshot — recreated only when an input changes, so
   *  `getScrollState` is referentially stable for `useSyncExternalStore`. */
  private scrollSnapshot: MugenScrollState | null = null;

  // ── Public scroll API ──────────────────────────────────────────────────────

  /** Number of items. */
  get length(): number {
    return this.items.length;
  }

  /** Total scrollable height (the spacer height), in px. */
  totalHeight(): number {
    return this.topSlotHeight + this.offset.total() + this.bottomSlotHeight;
  }

  /**
   * The list's reactive viewport/scroll state. Returns a stable reference until
   * one of its inputs changes, so it's safe as a `useSyncExternalStore`
   * snapshot. Read it reactively with `useMugenSelector`.
   */
  getScrollState(): MugenScrollState {
    const totalHeight = this.totalHeight();
    const viewportHeight = this.viewportHeight;
    const scrollTop = this.scrollTop;
    const prev = this.scrollSnapshot;
    if (
      prev &&
      prev.scrollTop === scrollTop &&
      prev.viewportHeight === viewportHeight &&
      prev.totalHeight === totalHeight
    ) {
      return prev;
    }
    const distanceFromBottom = Math.max(0, totalHeight - viewportHeight - scrollTop);
    const snap: MugenScrollState = { scrollTop, viewportHeight, totalHeight, distanceFromBottom };
    this.scrollSnapshot = snap;
    return snap;
  }

  /** Record the live scroll position (called by the list) and wake selectors. */
  setScrollTop(top: number): void {
    if (top === this.scrollTop) return;
    this.scrollTop = top;
    this.notifyGlobal();
  }

  /** Jump/animate to the very bottom and re-engage `stickToBottom`. */
  scrollToBottom(options: { behavior?: MugenScrollBehavior } = {}): void {
    // Prefer the controller-backed driver (wired by <MugenVList>): it re-targets
    // the bottom every frame, so it lands on the *current* bottom of a streaming
    // list and re-engages the stick. A bare native `scrollTo` undershoots a list
    // that grows mid-scroll and can leave the stick disengaged.
    if (this.scrollToBottomDriver) {
      this.scrollToBottomDriver(options.behavior ?? 'auto');
      return;
    }
    const el = this.scrollEl;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: options.behavior ?? 'auto' });
  }

  /** Jump/animate to the very top (status-bar tap on iOS, "back to start"
   *  affordances). The list-wired driver breaks the stick and, from deep in
   *  history, teleports into glide range first — a long smooth scroll's
   *  animated distance is otherwise unpaintable. */
  scrollToTop(options: { behavior?: MugenScrollBehavior } = {}): void {
    if (this.scrollToTopDriver) {
      this.scrollToTopDriver(options.behavior ?? 'auto');
      return;
    }
    this.stickInterrupt?.();
    const el = this.scrollEl;
    if (!el) return;
    el.scrollTo({ top: 0, behavior: options.behavior ?? 'auto' });
  }

  /** Scroll a row into view by its key. No-op if the key is unknown. */
  scrollToItem(key: string, options?: ScrollToOptions): void {
    const i = this.keyToIndex.get(key);
    if (i !== undefined) this.scrollToIndex(i, options);
  }

  /** Scroll a row into view by index. */
  scrollToIndex(index: number, options: ScrollToOptions = {}): void {
    const el = this.scrollEl;
    if (!el) return;
    const target = this.scrollTargetForIndex(index, options.align);
    if (target == null) return;
    // Scrolling up leaves the bottom on purpose — break the stick the way a
    // wheel-up would, or the spring cancels this scroll and pins us back.
    // (A same-position or downward target keeps the stick: escaping at the
    // bottom would silently disable it with no scroll event to re-engage.)
    if (target < el.scrollTop - 1) this.stickInterrupt?.();
    el.scrollTo({ top: target, behavior: options.behavior ?? 'auto' });
  }

  /** The scrollTop that would place a row according to `align`. */
  scrollTargetForIndex(index: number, align: MugenScrollAlign = 'auto'): number | null {
    const el = this.scrollEl;
    if (!el || index < 0 || index >= this.items.length) return null;
    const top = this.topSlotHeight + this.offset.offsetOf(index);
    const h = this.offset.heightAt(index);
    const vh = this.viewportHeight || el.clientHeight;
    let target: number;
    if (align === 'start') target = top;
    else if (align === 'center') target = top - (vh - h) / 2;
    else if (align === 'end') target = top - (vh - h);
    else {
      const cur = el.scrollTop;
      if (top >= cur && top + h <= cur + vh) return null; // already fully visible
      target = top < cur ? top : top - (vh - h); // scroll to the nearest edge
    }
    return Math.max(0, target);
  }

  // ── Wiring from <MugenVList> ────────────────────────────────────────────────

  /** Attach the scroll element so scrollToItem / re-anchoring can drive it. */
  attachScroller(el: HTMLElement | null): void {
    this.scrollEl = el;
  }

  /** Replace the data. Marks dirty; the measure happens in `sync()`. Compute-only. */
  setItems(items: T[]): void {
    if (items === this.items) return;
    this.items = items;
    this.itemsDirty = true;
  }

  /** Store render-time config; flag a re-measure if a measure-affecting field changed. */
  configure(config: MugenConfig<T>): void {
    const dk = defaultsKey(config.defaults);
    if (this.config == null || dk !== this.lastDefaultsKey || config.maxW !== this.lastMaxW) {
      this.geometryDirty = true;
    }
    this.lastDefaultsKey = dk;
    this.lastMaxW = config.maxW;
    this.config = config;
  }

  /** Update viewport size / root font-size. Flags a re-measure if content width changed. */
  setViewport(width: number, height: number, rootPx: number): void {
    this.viewportHeight = height;
    const before = this.contentWidth();
    if (width !== this.viewportWidth || rootPx !== this.rootPx) {
      this.viewportWidth = width;
      this.rootPx = rootPx;
      if (this.contentWidth() !== before) this.geometryDirty = true;
    }
  }

  /** Apply pending data/geometry changes as a single re-measure. Call once per render. */
  sync(): void {
    if (!this.ready()) return;
    // Capture the top-visible keyed row before re-measuring so we can keep it
    // visually stable afterwards. This covers item prepends AND a top-slot
    // height change (a loading skeleton appearing/disappearing, a header
    // growing): the slot sits above every row, so a change to its height shifts
    // all of them — without compensation the viewport jumps. The anchor row's
    // offset includes `topSlotHeight`, so re-reading it after the re-measure
    // folds the slot delta into the same correction as a prepend. Skip it on a
    // geometry reflow (a resize / web-font settle re-wraps every row at once):
    // there `stickToBottom` owns the correction, and a stale per-row anchor
    // would fight it. A no-op (delta 0) when nothing above the fold moved.
    const skipAnchor = this.geometryDirty && !this.itemsDirty;
    const anchor = !skipAnchor && this.keys.length > 0 ? this.captureScrollAnchor() : null;
    if (this.itemsDirty) this.recomputeKeys();
    if (this.geometryDirty) this.heightMemo.clear(); // widths/fonts changed: every height is stale
    if (this.itemsDirty || this.geometryDirty) this.remeasureAll();
    else this.remeasureSlots();
    if (anchor) this.queueScrollAnchor(anchor);
    this.itemsDirty = false;
    this.geometryDirty = false;
    // The measure walk unwound (ambient is null again) — deliver any row/global
    // notifications that fired mid-walk, now safely (see flushDeferredNotifies).
    this.flushDeferredNotifies();
  }

  private captureScrollAnchor(): { key: string; top: number } | null {
    if (this.keys.length === 0) return null;
    const index = this.indexAt(this.scrollTop);
    const key = this.keys[index];
    if (key == null) return null;
    return { key, top: this.offsetOf(index) };
  }

  private queueScrollAnchor(anchor: { key: string; top: number }): void {
    const index = this.keyToIndex.get(anchor.key);
    if (index == null) return;
    const delta = this.offsetOf(index) - anchor.top;
    if (delta !== 0) this.pendingScrollAnchorDelta += delta;
  }

  /** @internal Shift to apply after a data change to keep visible keyed content stable. */
  takeScrollAnchorDelta(): number {
    const delta = this.pendingScrollAnchorDelta;
    this.pendingScrollAnchorDelta = 0;
    return delta;
  }

  /** Re-measure everything (e.g. after web fonts settle). Compute-only. */
  remeasure(): void {
    if (!this.ready()) return;
    this.heightMemo.clear(); // new font tables: every height is stale
    this.remeasureAll();
    this.notifyGlobal();
    this.flushDeferredNotifies();
  }

  private ready(): boolean {
    return this.config != null && this.items.length >= 0 && this.contentWidth() > 0;
  }

  /** Resolved content width = min(viewport, maxW). */
  contentWidth(): number {
    return contentWidth(this.viewportWidth, this.config?.maxW, this.rootPx);
  }

  /** The list-level text defaults, provided to `Text` via context. */
  get textDefaults(): TextDefaults {
    return this.config?.defaults ?? {};
  }

  /** Produce a row's primitive tree (call inside a session). */
  renderRow(item: T): ReactNode {
    return this.config!.render(item);
  }

  /** Whether the list centers its content column (maxW narrower than the viewport). */
  isCentered(): boolean {
    return (
      Number.isFinite(resolveMaxWidthPx(this.config?.maxW, this.rootPx)) &&
      this.contentWidth() < this.viewportWidth
    );
  }

  private recomputeKeys(): void {
    const getKey = this.config!.getKey;
    this.keys = this.items.map((it, i) => getKey(it, i));
    this.keyToIndex = new Map(this.keys.map((k, i) => [k, i]));
    const live = new Set(this.keys);
    for (const key of [...this.rows.keys()]) {
      if (!live.has(key)) this.removeRow(key);
    }
  }

  private removeRow(key: string): void {
    this.heightMemo.delete(key);
    const rec = this.rows.get(key);
    if (!rec) return;
    for (const slot of rec.slots) {
      if (slot.kind === 'effect') {
        slot.pending = null;
        slot.cleanup?.();
      }
    }
    for (const slot of rec.keyed.values()) {
      if (slot.kind === 'effect') {
        slot.pending = null;
        slot.cleanup?.();
      }
    }
    this.clock.untrackRow(key);
    this.rows.delete(key);
  }

  private remeasureAll(): void {
    const width = this.contentWidth();
    const n = this.items.length;
    const heights = new Float64Array(n);
    this.estimatedKeys.clear();
    const lazy = this.lazyMeasure;
    const lazyLo = lazy ? lazy.head : Number.POSITIVE_INFINITY;
    const lazyHi = lazy ? n - lazy.tail : Number.POSITIVE_INFINITY;
    // Running average of known heights — the estimate for deferred rows.
    let knownSum = 0;
    let knownCount = 0;
    for (let i = 0; i < n; i++) {
      const key = this.keys[i]!;
      const item = this.items[i]!;
      const memo = this.heightMemo.get(key);
      if (memo !== undefined && memo.item === item) {
        heights[i] = memo.height;
        if (!this.estimatedKeys.has(key)) {
          knownSum += memo.height;
          knownCount++;
        }
        continue;
      }
      // Never measured by this instance: a persistent cache (if plugged in)
      // knows the default-state height without walking the row.
      let h = memo === undefined ? this.heightCache?.get(key, width) : undefined;
      if (h === undefined) {
        if (i >= lazyLo && i < lazyHi) {
          // Deferred: estimate now, refine later. Not memoized as real, never
          // written to the cache.
          const est = knownCount > 0 ? knownSum / knownCount : 200;
          this.estimatedKeys.add(key);
          this.heightMemo.set(key, { item, height: est });
          heights[i] = est;
          continue;
        }
        h = this.measureRow(key, item, width);
        if (memo === undefined) this.heightCache?.set(key, width, h);
      }
      this.estimatedKeys.delete(key);
      this.heightMemo.set(key, { item, height: h });
      heights[i] = h;
      knownSum += h;
      knownCount++;
    }
    this.offset = new OffsetIndex(heights);
    this.remeasureSlots();
  }

  /** Whether a row's recorded height is still an estimate (see `lazyMeasure`). */
  isEstimated(key: string): boolean {
    return this.estimatedKeys.has(key);
  }

  /** How many rows still carry estimated heights. */
  estimatedCount(): number {
    return this.estimatedKeys.size;
  }

  /**
   * Replace one row's ESTIMATE with its real measured height, immediately —
   * called the moment a row is about to paint (an estimated height would
   * mis-position everything after it in the window). The height delta flows
   * through the scroll-anchor channel when the row sits above the viewport,
   * so the visible content never shifts.
   */
  ensureMeasured(key: string): void {
    if (!this.estimatedKeys.has(key)) return;
    this.refineOne(key);
    this.notifyGlobal();
    this.flushDeferredNotifies();
  }

  /**
   * Refine estimated heights until `budgetMs` is spent, nearest-to-the-bottom
   * first (transcripts anchor at the bottom, so the rows just above the
   * measured tail are the ones a scroll reaches next). Returns how many
   * estimates remain.
   */
  refineEstimates(budgetMs: number): number {
    if (this.estimatedKeys.size === 0) return 0;
    const deadline = performance.now() + budgetMs;
    const pending = [...this.estimatedKeys]
      .map((key) => this.keyToIndex.get(key))
      .filter((i): i is number => i != null)
      .sort((a, b) => b - a);
    for (const i of pending) {
      if (performance.now() >= deadline) break;
      this.refineOne(this.keys[i]!);
    }
    this.notifyGlobal();
    this.flushDeferredNotifies();
    return this.estimatedKeys.size;
  }

  private refineOne(key: string): void {
    const i = this.keyToIndex.get(key);
    if (i == null) {
      this.estimatedKeys.delete(key);
      return;
    }
    const width = this.contentWidth();
    const item = this.items[i]!;
    const h = this.measureRow(key, item, width);
    this.heightCache?.set(key, width, h);
    this.estimatedKeys.delete(key);
    this.heightMemo.set(key, { item, height: h });
    const anchorIdx = this.indexAt(this.scrollTop);
    const delta = this.offset.setHeight(i, h);
    // Keep the viewport stable when the corrected row sits above it (the
    // same channel prepends use; on iOS the origin absorbs it — no scroll).
    if (delta !== 0 && i < anchorIdx) this.pendingScrollAnchorDelta += delta;
  }

  private remeasureSlots(): void {
    const width = this.contentWidth();
    this.topSlotHeight = this.measureSlot(this.config?.renderTop, width);
    this.bottomSlotHeight = this.measureSlot(this.config?.renderBottom, width);
  }

  private measureSlot(render: (() => ReactNode) | undefined, width: number): number {
    if (!render || !this.config) return 0;
    return runInert(() => heightOf(render(), width, this.config!.defaults));
  }

  // ── Measurement ─────────────────────────────────────────────────────────────

  private ensureRow(key: string, item: unknown): RowRecord {
    let rec = this.rows.get(key);
    if (!rec) {
      rec = { item, slots: [], keyed: new Map(), slotEpoch: 0, scope: null, version: 0, subs: new Set() };
      this.rows.set(key, rec);
    }
    return rec;
  }

  /** @internal The stable per-row handle `<MugenVList>` provides via context. */
  scopeRef(key: string): RowScopeRef {
    const rec = this.ensureRow(key, undefined);
    if (!rec.scope) rec.scope = { host: this, rowKey: key };
    return rec.scope;
  }

  /** Measure one row at the current content width: run `render(item)` in the
   *  session (so hooks resolve) under an inert dispatcher, then walk the tree. */
  private measureRow(key: string, item: T, width: number): number {
    const rec = this.ensureRow(key, item);
    rec.item = item;
    this.activeRec = rec;
    this.activeKey = key;
    const session: MugenSession = {
      host: this,
      rowKey: key,
      mode: 'measure',
      phase: 'root',
      hookIndex: { current: 0 },
    };
    // The walk gets its own session (phase `walk`): the walker calls nested
    // components as plain functions, and `useMugenRow` scopes resolve through
    // it — while positional hooks, whose call order the walk can't reproduce,
    // throw a pointer at useMugenRow.
    const walkSession: MugenSession = {
      host: this,
      rowKey: key,
      mode: 'measure',
      phase: 'walk',
      hookIndex: { current: 0 },
    };
    const height = runInert(() => {
      const tree = withSession(session, () => this.config!.render(item));
      return withSession(walkSession, () => heightOf(tree, width, this.config!.defaults));
    });
    this.trimSlots(rec, session.hookIndex.current);
    this.activeRec = null;
    this.activeKey = null;
    return height;
  }

  /** Drop slots past the hook count used this pass (conditional-hook safety). */
  private trimSlots(rec: RowRecord, count: number): void {
    for (let i = count; i < rec.slots.length; i++) {
      const slot = rec.slots[i]!;
      if (slot.kind === 'effect') {
        slot.pending = null;
        slot.cleanup?.();
      }
    }
    if (rec.slots.length > count) rec.slots.length = count;
  }

  /** The row whose slots the SlotHost methods address (set during measureRow). */
  private activeRec: RowRecord | null = null;
  private activeKey: string | null = null;

  private recFor(key: string): RowRecord | null {
    // During a measure the active record is hot; during render we look it up.
    if (this.activeKey === key && this.activeRec) return this.activeRec;
    return this.rows.get(key) ?? null;
  }

  // ── SlotHost (called by hooks through the session) ──────────────────────────

  ensureState(key: string, index: number, init: unknown): unknown {
    const rec = this.recFor(key);
    if (!rec) return typeof init === 'function' ? (init as () => unknown)() : init;
    let slot = rec.slots[index];
    if (!slot) {
      slot = { kind: 'state', value: typeof init === 'function' ? (init as () => unknown)() : init };
      rec.slots[index] = slot;
    } else if (slot.kind !== 'state') {
      throw hookOrderError('useMugenState');
    }
    return (slot as StateSlot).value;
  }

  setState(key: string, index: number, updater: unknown): void {
    const rec = this.rows.get(key);
    const slot = rec?.slots[index];
    if (!rec || !slot || slot.kind !== 'state') return;
    const prev = slot.value;
    const next = typeof updater === 'function' ? (updater as (p: unknown) => unknown)(prev) : updater;
    if (Object.is(next, prev)) return;
    slot.value = next;
    this.invalidate(key);
  }

  memo(key: string, index: number, factory: () => unknown, deps: readonly unknown[]): unknown {
    const rec = this.recFor(key);
    if (!rec) return factory();
    let slot = rec.slots[index];
    if (!slot) {
      slot = { kind: 'memo', value: factory(), deps };
      rec.slots[index] = slot;
    } else if (slot.kind !== 'memo') {
      throw hookOrderError('useMugenMemo');
    } else if (!shallowEqual(slot.deps, deps)) {
      slot.value = factory();
      slot.deps = deps;
    }
    return (slot as MemoSlot).value;
  }

  effect(
    key: string,
    index: number,
    effect: () => void | EffectCleanup,
    deps: readonly unknown[],
    mode: SessionMode,
  ): void {
    const rec = this.recFor(key);
    if (!rec) return;
    let slot = rec.slots[index];
    if (!slot) {
      slot = { kind: 'effect', deps: null, pending: null };
      rec.slots[index] = slot;
    } else if (slot.kind !== 'effect') {
      throw hookOrderError('useMugenEffect');
    }
    this.scheduleEffect(slot as EffectSlot, effect, deps, mode);
  }

  private scheduleEffect(
    es: EffectSlot,
    effect: () => void | EffectCleanup,
    deps: readonly unknown[],
    mode: SessionMode,
  ): void {
    // Only the measure pass schedules; the render pass just claims the slot.
    if (mode !== 'measure') return;
    if (es.deps !== null && shallowEqual(es.deps, deps)) return;
    es.deps = deps;
    es.cleanup?.();
    es.cleanup = undefined;
    const token = {};
    es.pending = token;
    queueMicrotask(() => {
      if (es.pending !== token) return;
      es.pending = null;
      try {
        const cleanup = effect();
        if (typeof cleanup === 'function') es.cleanup = cleanup;
      } catch (err) {
        if (typeof console !== 'undefined') console.error('mugen: effect failed', err);
      }
    });
  }

  // ── Keyed slots (useMugenRow scopes in nested components) ───────────────────

  private keyedSlot(rec: RowRecord, slotKey: string, kind: Slot['kind']): Slot | undefined {
    const slot = rec.keyed.get(slotKey);
    if (slot && slot.kind !== kind) {
      throw new Error(
        `mugen: the scoped slot "${slotKey}" was previously a ${slot.kind} slot. Scope ids ` +
          `must be unique per row, and a scope's hooks must run unconditionally in the same order.`,
      );
    }
    return slot;
  }

  keyedState(key: string, slotKey: string, init: unknown): unknown {
    const rec = this.ensureRow(key, undefined);
    let slot = this.keyedSlot(rec, slotKey, 'state');
    if (!slot) {
      slot = { kind: 'state', value: typeof init === 'function' ? (init as () => unknown)() : init };
      rec.keyed.set(slotKey, slot);
    }
    return (slot as StateSlot).value;
  }

  setKeyedState(key: string, slotKey: string, updater: unknown): void {
    const rec = this.rows.get(key);
    const slot = rec?.keyed.get(slotKey);
    if (!rec || !slot || slot.kind !== 'state') return;
    const prev = slot.value;
    const next = typeof updater === 'function' ? (updater as (p: unknown) => unknown)(prev) : updater;
    if (Object.is(next, prev)) return;
    slot.value = next;
    // A nested slot changed under elements the row may hold stable across
    // renders (useMugenMemo): bump the epoch so the walker's height memo
    // re-walks this row instead of serving the pre-change height.
    rec.slotEpoch++;
    this.invalidate(key);
  }

  keyedMemo(key: string, slotKey: string, factory: () => unknown, deps: readonly unknown[]): unknown {
    const rec = this.ensureRow(key, undefined);
    let slot = this.keyedSlot(rec, slotKey, 'memo');
    if (!slot) {
      slot = { kind: 'memo', value: factory(), deps };
      rec.keyed.set(slotKey, slot);
    } else if (!shallowEqual((slot as MemoSlot).deps, deps)) {
      (slot as MemoSlot).value = factory();
      (slot as MemoSlot).deps = deps;
    }
    return (slot as MemoSlot).value;
  }

  keyedEffect(
    key: string,
    slotKey: string,
    effect: () => void | EffectCleanup,
    deps: readonly unknown[],
    mode: SessionMode,
  ): void {
    const rec = this.ensureRow(key, undefined);
    let slot = this.keyedSlot(rec, slotKey, 'effect');
    if (!slot) {
      slot = { kind: 'effect', deps: null, pending: null };
      rec.keyed.set(slotKey, slot);
    }
    this.scheduleEffect(slot as EffectSlot, effect, deps, mode);
  }

  // ── Animated values (the clock advances them; measure and paint read them) ──

  private clock = new AnimationClock((rowKeys) => {
    for (const rowKey of rowKeys) {
      const rec = this.rows.get(rowKey);
      // Tween frames change measured output without any element changing, so
      // they bust the height memo the same way keyed writes do.
      if (rec) rec.slotEpoch++;
      this.invalidate(rowKey);
    }
  });

  /** @internal Number of in-flight tweens (tests / diagnostics). */
  activeTweenCount(): number {
    return this.clock.size;
  }

  private ensureTweenSlot(rec: RowRecord, slotKey: string, initial: number): TweenSlot {
    let slot = this.keyedSlot(rec, slotKey, 'tween') as TweenSlot | undefined;
    if (!slot) {
      slot = {
        kind: 'tween',
        value: initial,
        from: initial,
        target: initial,
        start: 0,
        duration: 0,
        ease: resolveEasing(undefined),
        active: false,
      };
      rec.keyed.set(slotKey, slot);
    }
    return slot;
  }

  private startTween(
    rowKey: string,
    slot: TweenSlot,
    target: number,
    options: MugenTweenOptions | undefined,
  ): void {
    const duration = options?.duration ?? DEFAULT_TWEEN_MS;
    if (duration <= 0 || !canAnimate()) {
      slot.value = slot.from = slot.target = target;
      slot.active = false;
      this.clock.untrack(slot);
      return;
    }
    slot.from = slot.value;
    slot.target = target;
    slot.start = performance.now();
    slot.duration = duration;
    slot.ease = resolveEasing(options?.easing);
    slot.active = true;
    this.clock.track(rowKey, slot);
  }

  tween(
    key: string,
    slotKey: string,
    target: number,
    options: MugenTweenOptions | undefined,
    retarget: boolean,
  ): number {
    const rec = this.ensureRow(key, undefined);
    const slot = this.ensureTweenSlot(rec, slotKey, target);
    // Only the measure pass retargets (state changes always measure before they
    // paint); the render pass just reads the value the clock last wrote.
    if (retarget && target !== slot.target) this.startTween(key, slot, target, options);
    return slot.value;
  }

  collapseTween(
    key: string,
    slotKey: string,
    open: boolean,
    natural: number,
    options: MugenTweenOptions | undefined,
  ): number {
    const rec = this.ensureRow(key, undefined);
    const target = open ? natural : 0;
    const existing = this.keyedSlot(rec, slotKey, 'tween') as TweenSlot | undefined;
    if (!existing) {
      const slot = this.ensureTweenSlot(rec, slotKey, target);
      slot.lastOpen = open;
      return slot.value;
    }
    if (open !== existing.lastOpen) {
      existing.lastOpen = open;
      this.startTween(key, existing, target, options);
    } else if (target !== existing.target) {
      // The content changed size without a toggle (text streaming into an open
      // collapse, a resize re-wrap). Mid-flight, re-aim the running animation;
      // settled, snap — animating every growth tick would fight scroll
      // anchoring and the stick-to-bottom spring.
      if (existing.active) this.startTween(key, existing, target, options);
      else existing.value = existing.from = existing.target = target;
    }
    return existing.value;
  }

  tweenValue(key: string, slotKey: string): number | null {
    const slot = this.rows.get(key)?.keyed.get(slotKey);
    return slot && slot.kind === 'tween' ? slot.value : null;
  }

  slotEpoch(key: string): number {
    return this.rows.get(key)?.slotEpoch ?? 0;
  }

  // ── The one height-changing path ─────────────────────────────────────────────

  /** Set by the list: shift scroll by `delta` px to keep visible content stable. */
  scrollAnchor: ((delta: number) => void) | null = null;

  /** Set by the list: drive `scrollToBottom` through the scroll controller (spring
   *  for `smooth`, jump otherwise) so it re-engages the stick and tracks growth. */
  scrollToBottomDriver: ((behavior: MugenScrollBehavior) => void) | null = null;

  /** Set by the list: drive `scrollToTop` with stick-break + the platform's
   *  long-distance choreography (teleport into glide range, then glide). */
  scrollToTopDriver: ((behavior: MugenScrollBehavior) => void) | null = null;

  /** Set by the list: break the stick-to-bottom spring before a programmatic
   *  scroll *up*. The controller only releases on user input, so without this
   *  its frame loop out-writes (and thereby cancels) the scroll during and
   *  just after streamed growth. */
  stickInterrupt: (() => void) | null = null;

  /** Re-measure a single row, patch the index, re-anchor, notify row + list. */
  invalidate(key: string): void {
    const i = this.keyToIndex.get(key);
    if (i === undefined) return;
    const width = this.contentWidth();
    if (width <= 0) return;
    const oldTop = this.offset.offsetOf(i);
    const oldHeight = this.offset.heightAt(i);
    const newHeight = this.measureRow(key, this.items[i]!, width);
    // Update the memo — NOT the persistent cache: this row's slot state may
    // have diverged from default (that's usually why it invalidated), and the
    // store must only ever hold default-state heights.
    this.heightMemo.set(key, { item: this.items[i]!, height: newHeight });
    const delta = this.offset.setHeight(i, newHeight);
    if (delta !== 0 && this.scrollAnchor && oldTop + oldHeight <= this.scrollTop) {
      this.scrollAnchor(delta); // row was entirely above the fold: keep content stable
    }
    this.notifyRow(key);
    this.notifyGlobal();
    this.flushDeferredNotifies();
  }

  // ── Windowing helpers (read by the list) ─────────────────────────────────────

  keyAt(i: number): string {
    return this.keys[i]!;
  }
  /** Index of a row key in the current items, or undefined if it left. */
  indexOfKey(key: string): number | undefined {
    return this.keyToIndex.get(key);
  }
  itemAt(i: number): T {
    return this.items[i]!;
  }
  offsetOf(i: number): number {
    return this.topSlotHeight + this.offset.offsetOf(i);
  }
  indexAt(y: number): number {
    return this.offset.indexAt(Math.max(0, y - this.topSlotHeight));
  }
  /** @internal Height of the scrollable top slot. */
  topHeight(): number {
    return this.topSlotHeight;
  }
  /** @internal Height of the measured item content, excluding top/bottom slots. */
  itemsHeight(): number {
    return this.offset.total();
  }

  // ── Subscriptions ────────────────────────────────────────────────────────────

  subscribeGlobal(cb: () => void): () => void {
    this.globalSubs.add(cb);
    return () => this.globalSubs.delete(cb);
  }
  globalVersion(): number {
    return this.globalV;
  }
  // Notifications that fire while a row session is ambient (the measure walk,
  // or a row's render(item) call) are DEFERRED until the session unwinds. A
  // notify calls subscribers' `useSyncExternalStore` callbacks, and React can
  // re-render a subscribed component *synchronously* to resolve the store
  // change — if that happens mid-walk (ambient set), a nested component's
  // `useMugenRow` takes the ambient (0-hook) path where a normal render takes
  // the 4-hook path, and the fiber throws "rendered fewer hooks than
  // expected". Deferring to when ambient is null means any such re-render sees
  // the correct (nested) path. Version bumps defer too, so getSnapshot can't
  // tear mid-walk either.
  private deferGlobal = false;
  private deferRows = new Set<string>();

  private flushDeferredNotifies(): void {
    if (currentSession() !== null) return; // still inside a session — wait
    if (this.deferGlobal) {
      this.deferGlobal = false;
      this.notifyGlobal();
    }
    if (this.deferRows.size > 0) {
      const keys = [...this.deferRows];
      this.deferRows.clear();
      for (const key of keys) this.notifyRow(key);
    }
  }

  notifyGlobal(): void {
    if (currentSession() !== null) {
      this.deferGlobal = true;
      return;
    }
    this.globalV++;
    for (const cb of this.globalSubs) cb();
  }

  subscribeRow(key: string, cb: () => void): () => void {
    const rec = this.ensureRow(key, undefined);
    rec.subs.add(cb);
    return () => rec.subs.delete(cb);
  }
  rowVersion(key: string): number {
    return this.rows.get(key)?.version ?? 0;
  }
  private notifyRow(key: string): void {
    if (currentSession() !== null) {
      this.deferRows.add(key);
      return;
    }
    const rec = this.rows.get(key);
    if (!rec) return;
    rec.version++;
    for (const cb of rec.subs) cb();
  }
}

function hookOrderError(hook: string): Error {
  return new Error(
    `mugen: ${hook}() was called in a different order than a previous render. The mugen ` +
      `hooks must run unconditionally and in the same order every time a row renders.`,
  );
}
