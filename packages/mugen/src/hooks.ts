import { requireSession } from './session';

export type EffectCleanup = () => void;
export type SetMugenState<S> = (next: S | ((prev: S) => S)) => void;

/**
 * Per-row state that can affect height (text, expansion, loaded content). Shaped
 * like `useState`, but the value lives in the list instance's slot store — so an
 * off-screen row's state is real and its height stays exact — and a `set`
 * re-measures the row. Call it directly inside a `<MugenVList>` `render`.
 */
export function useMugenState<S>(init: S | (() => S)): [S, SetMugenState<S>] {
  const s = requireSession('useMugenState');
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
  const s = requireSession('useMugenMemo');
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
  const s = requireSession('useMugenEffect');
  const index = s.hookIndex.current++;
  s.host.effect(s.rowKey, index, effect, deps, s.mode);
}
