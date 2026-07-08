import type { EffectCleanup } from './hooks';
import type { MugenTweenOptions } from './state/clock';

/**
 * The slot store a session reads/writes. The engine implements it; hooks call
 * through the ambient session so the same `useMugenState`/`useMugenMemo`/
 * `useMugenEffect` calls work in both the measure walk and the React render.
 *
 * Positional methods (index) serve the row-root hooks; keyed methods (slotKey)
 * serve `useMugenRow` scopes in nested components, where call order across the
 * measure walk and the React render can't be matched positionally.
 */
export interface SlotHost {
  ensureState(key: string, index: number, init: unknown): unknown;
  setState(key: string, index: number, updater: unknown): void;
  memo(key: string, index: number, factory: () => unknown, deps: readonly unknown[]): unknown;
  effect(
    key: string,
    index: number,
    effect: () => void | EffectCleanup,
    deps: readonly unknown[],
    mode: SessionMode,
  ): void;

  // ── Keyed slots (useMugenRow scopes; persist until the row is removed) ──
  keyedState(key: string, slotKey: string, init: unknown): unknown;
  setKeyedState(key: string, slotKey: string, updater: unknown): void;
  keyedMemo(key: string, slotKey: string, factory: () => unknown, deps: readonly unknown[]): unknown;
  keyedEffect(
    key: string,
    slotKey: string,
    effect: () => void | EffectCleanup,
    deps: readonly unknown[],
    mode: SessionMode,
  ): void;

  // ── Animated values ──
  /** Read-or-create the tween at `slotKey`; retarget it (measure pass only) when `target` moved. */
  tween(key: string, slotKey: string, target: number, options: MugenTweenOptions | undefined, retarget: boolean): number;
  /** `Collapse`'s height driver: animates open/close, snaps content growth while settled. */
  collapseTween(key: string, slotKey: string, open: boolean, natural: number, options: MugenTweenOptions | undefined): number;
  /** Current value of the tween at `slotKey`, or `null` if none exists (render-pass read). */
  tweenValue(key: string, slotKey: string): number | null;

  // ── Row bookkeeping the scoped hooks lean on ──
  /** Bumped on every keyed-slot write and every tween frame — folds into the walker's height memo. */
  slotEpoch(key: string): number;
  subscribeRow(key: string, cb: () => void): () => void;
  rowVersion(key: string): number;

  // ── Render-measure escape hatch ──
  /** Override a row's recorded height with one read from a live mount
   *  (`ref.measure()`), routed through the estimate→anchor-absorption channel.
   *  Returns the applied delta (0 if unchanged). See `applyMeasuredHeight`. */
  applyMeasuredHeight(key: string, measuredHeight: number): number;
}

export type SessionMode = 'measure' | 'render';

/**
 * Which part of a pass the session covers. `root` spans the row's `render(item)`
 * call — positional hooks live here. `walk` spans the measure walk over the
 * returned tree, where the walker calls nested components as plain functions:
 * scoped (`useMugenRow`) hooks resolve, positional hooks throw.
 */
export type SessionPhase = 'root' | 'walk';

/**
 * The ambient row session. The engine installs it around a row's `render(item)`
 * call (both when measuring and when rendering) and around the measure walk,
 * so the mugen hooks can resolve their per-row slot without a React
 * subscription.
 */
export interface MugenSession {
  readonly host: SlotHost;
  readonly rowKey: string;
  readonly mode: SessionMode;
  readonly phase?: SessionPhase;
  readonly hookIndex: { current: number };
}

let current: MugenSession | null = null;

export function currentSession(): MugenSession | null {
  return current;
}

/** Run `fn` with `session` ambient, restoring after (nestable). */
export function withSession<R>(session: MugenSession, fn: () => R): R {
  const prev = current;
  current = session;
  try {
    return fn();
  } finally {
    current = prev;
  }
}

/** The session for the hook now running, or a precise error if there is none. */
export function requireSession(hook: string): MugenSession {
  if (!current) {
    throw new Error(
      `mugen: ${hook}() must be called directly inside a <MugenVList> render function — ` +
        `not in a nested component, an event handler, or outside the list. For hooks in ` +
        `nested components, use useMugenRow(id).`,
    );
  }
  return current;
}

/** Like `requireSession`, but rejects the walk phase (positional hooks are root-only). */
export function requireRootSession(hook: string): MugenSession {
  const s = requireSession(hook);
  if (s.phase === 'walk') {
    throw new Error(
      `mugen: ${hook}() was called in a nested component. Positional hooks only work at ` +
        `the root of a row's render function; in a nested component, create a scope with ` +
        `useMugenRow(id) and use its methods instead.`,
    );
  }
  return s;
}
