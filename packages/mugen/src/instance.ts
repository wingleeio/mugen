import type { ReactNode } from 'react';
import { OffsetIndex } from './offset/offset-index';
import { runInert } from './state/dispatcher';
import { heightOf } from './walker';
import { contentWidth, resolveMaxWidthPx } from './tokens-resolve';
import { withSession, type MugenSession, type SessionMode, type SlotHost } from './session';
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
type Slot = StateSlot | MemoSlot | EffectSlot;

interface RowRecord {
  item: unknown;
  slots: Slot[];
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
    if (this.itemsDirty || this.geometryDirty) this.remeasureAll();
    else this.remeasureSlots();
    if (anchor) this.queueScrollAnchor(anchor);
    this.itemsDirty = false;
    this.geometryDirty = false;
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
    this.remeasureAll();
    this.notifyGlobal();
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
    const rec = this.rows.get(key);
    if (!rec) return;
    for (const slot of rec.slots) {
      if (slot.kind === 'effect') {
        slot.pending = null;
        slot.cleanup?.();
      }
    }
    this.rows.delete(key);
  }

  private remeasureAll(): void {
    const width = this.contentWidth();
    const heights = new Float64Array(this.items.length);
    for (let i = 0; i < this.items.length; i++) {
      heights[i] = this.measureRow(this.keys[i]!, this.items[i]!, width);
    }
    this.offset = new OffsetIndex(heights);
    this.remeasureSlots();
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
      rec = { item, slots: [], version: 0, subs: new Set() };
      this.rows.set(key, rec);
    }
    return rec;
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
      hookIndex: { current: 0 },
    };
    const height = runInert(() => {
      const tree = withSession(session, () => this.config!.render(item));
      return heightOf(tree, width, this.config!.defaults);
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
    const es = slot as EffectSlot;
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

  // ── The one height-changing path ─────────────────────────────────────────────

  /** Set by the list: shift scroll by `delta` px to keep visible content stable. */
  scrollAnchor: ((delta: number) => void) | null = null;

  /** Set by the list: drive `scrollToBottom` through the scroll controller (spring
   *  for `smooth`, jump otherwise) so it re-engages the stick and tracks growth. */
  scrollToBottomDriver: ((behavior: MugenScrollBehavior) => void) | null = null;

  /** Re-measure a single row, patch the index, re-anchor, notify row + list. */
  invalidate(key: string): void {
    const i = this.keyToIndex.get(key);
    if (i === undefined) return;
    const width = this.contentWidth();
    if (width <= 0) return;
    const oldTop = this.offset.offsetOf(i);
    const oldHeight = this.offset.heightAt(i);
    const newHeight = this.measureRow(key, this.items[i]!, width);
    const delta = this.offset.setHeight(i, newHeight);
    if (delta !== 0 && this.scrollAnchor && oldTop + oldHeight <= this.scrollTop) {
      this.scrollAnchor(delta); // row was entirely above the fold: keep content stable
    }
    this.notifyRow(key);
    this.notifyGlobal();
  }

  // ── Windowing helpers (read by the list) ─────────────────────────────────────

  keyAt(i: number): string {
    return this.keys[i]!;
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
  notifyGlobal(): void {
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
