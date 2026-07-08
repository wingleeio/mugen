import { useCallback, useContext, useSyncExternalStore } from 'react';
import { currentSession, requireRootSession, type SessionMode, type SlotHost } from './session';
import { RowScopeContext } from './row-scope';
import type { MugenTweenOptions } from './state/clock';

export type EffectCleanup = () => void;
export type SetMugenState<S> = (next: S | ((prev: S) => S)) => void;

/**
 * Per-row state that can affect height (text, expansion, loaded content). Shaped
 * like `useState`, but the value lives in the list instance's slot store — so an
 * off-screen row's state is real and its height stays exact — and a `set`
 * re-measures the row. Call it directly inside a `<MugenVList>` `render`; in a
 * nested component, use `useMugenRow(id).state(...)` instead.
 */
export function useMugenState<S>(init: S | (() => S)): [S, SetMugenState<S>] {
  const s = requireRootSession('useMugenState');
  const index = s.hookIndex.current++;
  const value = s.host.ensureState(s.rowKey, index, init) as S;
  const key = s.rowKey;
  const set: SetMugenState<S> = (next) => s.host.setState(key, index, next);
  return [value, set];
}

/**
 * Memoize a derived value per row, recomputed when `deps` change (`Object.is`).
 * Like `useMemo`, but readable in the measure walk — keep expensive per-row
 * derivation out of the hot path.
 */
export function useMugenMemo<V>(factory: () => V, deps: readonly unknown[]): V {
  const s = requireRootSession('useMugenMemo');
  const index = s.hookIndex.current++;
  return s.host.memo(s.rowKey, index, factory as () => unknown, deps) as V;
}

/**
 * Run a side effect per row when `deps` change, off the measure pass (on a
 * microtask). Like `useEffect` — return a cleanup to cancel/teardown — except it
 * runs for **every** row, on- or off-screen, so transforming content (parse
 * markdown, highlight, load) and then `set`-ing height-affecting state keeps the
 * row's height exact the moment it resolves.
 */
export function useMugenEffect(effect: () => void | EffectCleanup, deps: readonly unknown[]): void {
  const s = requireRootSession('useMugenEffect');
  const index = s.hookIndex.current++;
  s.host.effect(s.rowKey, index, effect, deps, s.mode);
}

/**
 * An animated number. When `target` changes, the value tweens from wherever it
 * is to the new target on the list's animation clock — and because each frame
 * re-measures the row with the current value, layout driven by it (a `Box`
 * `height`, a `padding`) stays exact while it moves: offsets, scrollbar and
 * paint agree at every intermediate frame. Retargeting mid-flight starts from
 * the current value. Snaps to the target when `prefers-reduced-motion` is set
 * or `duration` is 0.
 *
 * Call at the root of a row's `render`; in a nested component, use
 * `useMugenRow(id).tween(...)`.
 */
export function useMugenTween(target: number, options?: MugenTweenOptions): number {
  const s = requireRootSession('useMugenTween');
  const index = s.hookIndex.current++;
  return s.host.tween(s.rowKey, `@tween:${index}`, target, options, s.mode === 'measure');
}

/**
 * The row-scoped hooks, addressed through a scope id instead of global call
 * order — the form that works in nested components. Methods mirror the root
 * hooks one-to-one.
 */
export interface MugenRowScope {
  /** `useMugenState`, scoped. */
  state<S>(init: S | (() => S)): [S, SetMugenState<S>];
  /** `useMugenMemo`, scoped. */
  memo<V>(factory: () => V, deps: readonly unknown[]): V;
  /** `useMugenEffect`, scoped. */
  effect(effect: () => void | EffectCleanup, deps: readonly unknown[]): void;
  /** `useMugenTween`, scoped. */
  tween(target: number, options?: MugenTweenOptions): number;
  /**
   * Render-measure escape hatch: report this row's true height, read from a
   * live mount (e.g. `ref.measure()` on Fabric, synchronous in a layout
   * effect), and route it through the engine's estimate→anchor-absorption
   * channel. No-op during the measure walk (there is no mounted view then);
   * only the real fiber render applies it. Returns the applied delta.
   */
  renderMeasure(height: number): number;
}

class RowScopeImpl implements MugenRowScope {
  private n = 0;
  constructor(
    private readonly host: SlotHost,
    private readonly rowKey: string,
    private readonly mode: SessionMode,
    private readonly id: string,
  ) {}

  private slotKey(): string {
    return `${this.id}:${this.n++}`;
  }

  state<S>(init: S | (() => S)): [S, SetMugenState<S>] {
    const key = this.slotKey();
    const value = this.host.keyedState(this.rowKey, key, init) as S;
    const { host, rowKey } = this;
    return [value, (next) => host.setKeyedState(rowKey, key, next)];
  }

  memo<V>(factory: () => V, deps: readonly unknown[]): V {
    return this.host.keyedMemo(this.rowKey, this.slotKey(), factory as () => unknown, deps) as V;
  }

  effect(effect: () => void | EffectCleanup, deps: readonly unknown[]): void {
    this.host.keyedEffect(this.rowKey, this.slotKey(), effect, deps, this.mode);
  }

  tween(target: number, options?: MugenTweenOptions): number {
    return this.host.tween(this.rowKey, this.slotKey(), target, options, this.mode === 'measure');
  }

  renderMeasure(height: number): number {
    // The measure walk has no mounted view; only a real fiber render can
    // observe a rendered height, so ignore the walk (it would otherwise fight
    // the analytic height the walk itself just produced).
    if (this.mode === 'measure') return 0;
    return this.host.applyMeasuredHeight(this.rowKey, height);
  }
}

/**
 * Row-scoped hooks for **nested components** — the pieces a row's `render`
 * composes, where the positional hooks can't go (their call order across the
 * measure walk and the React render can't be matched).
 *
 * `id` names the scope's slots, so it must be unique within the row; two
 * instances of the same component need different ids — derive one from a prop.
 * The scope's methods are positional *within* the component, so call them
 * unconditionally in a fixed order, like any hooks. The state lives in the list
 * instance and persists while the row is off-screen, exactly like
 * `useMugenState`.
 *
 * No re-render tax: in a nested render this resolves through a context whose
 * value is one frozen object per row that never changes identity — context
 * alone never re-renders anything. The component instead subscribes to its
 * row's version, so it repaints on its own slot changes even when an ancestor
 * element is memo-stable (`useMugenMemo`) and React bails out of the subtree.
 */
export function useMugenRow(id: string): MugenRowScope {
  const ambient = currentSession();
  // ALWAYS call the same React hooks, in the same order, with NO early return
  // in between — otherwise a nested component that renders once with an ambient
  // session set (0 hooks) and once without (these 4 hooks) trips React's
  // "rendered fewer hooks than expected … accidental early return" invariant.
  // In the measure walk the inert dispatcher makes these no-ops (they read the
  // ambient scope, not the context), so calling them there is harmless; in a
  // real fiber render they subscribe the component to its row version. The
  // scope SOURCE is chosen after the hooks: the ambient session when one is
  // installed (measure walk or row root), else the RowScopeContext value.
  const ctx = useContext(RowScopeContext);
  const scope = ambient
    ? { host: ambient.host, rowKey: ambient.rowKey, mode: ambient.mode as SessionMode }
    : ctx
      ? { host: ctx.host, rowKey: ctx.rowKey, mode: 'render' as SessionMode }
      : null;
  const rowKey = scope?.rowKey ?? '';
  const host = scope?.host;
  const subscribe = useCallback(
    (cb: () => void) => (host ? host.subscribeRow(rowKey, cb) : () => {}),
    [host, rowKey],
  );
  const getVersion = useCallback(() => (host ? host.rowVersion(rowKey) : 0), [host, rowKey]);
  useSyncExternalStore(subscribe, getVersion, getVersion);
  if (scope === null) {
    throw new Error(
      'mugen: useMugenRow() found no row scope. It only works in components rendered ' +
        'inside a <MugenVList> row.',
    );
  }
  return new RowScopeImpl(scope.host, scope.rowKey, scope.mode, id);
}
