import type { EffectCleanup } from './hooks';

/**
 * The slot store a session reads/writes. The engine implements it; hooks call
 * through the ambient session so the same `useMugenState`/`useMugenMemo`/
 * `useMugenEffect` calls work in both the measure walk and the React render.
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
}

export type SessionMode = 'measure' | 'render';

/**
 * The ambient row session. The engine installs it around a row's `render(item)`
 * call (both when measuring and when rendering), so the mugen hooks can resolve
 * their per-row slot by call order without a React subscription.
 */
export interface MugenSession {
  readonly host: SlotHost;
  readonly rowKey: string;
  readonly mode: SessionMode;
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
        `not in a nested component, an event handler, or outside the list.`,
    );
  }
  return current;
}
