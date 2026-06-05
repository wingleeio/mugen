import * as React from 'react';

/**
 * The measure-pass hook dispatcher. To measure a row, the walker calls its
 * components as plain functions — but those components may call hooks. We swap
 * React's internal hook dispatcher for an inert one for the duration of the
 * walk: cosmetic state hooks return their initial value (they can't change
 * height, Invariant 1), context reads resolve to defaults, and effect hooks
 * throw (a row that needs an effect can't be measured without mounting — Phase
 * 8 surfaces this).
 */

type Dispatcher = Record<string, (...args: never[]) => unknown>;

interface DispatcherRef {
  get(): Dispatcher | null;
  set(d: Dispatcher | null): void;
}

function locate(): DispatcherRef | null {
  const R = React as unknown as Record<string, unknown>;
  // React 19: __CLIENT_INTERNALS_*  with current dispatcher at `.H`
  for (const key of Object.keys(R)) {
    if (key.startsWith('__CLIENT_INTERNALS')) {
      const internals = R[key] as Record<string, unknown> | undefined;
      if (internals && 'H' in internals) {
        return {
          get: () => (internals.H as Dispatcher) ?? null,
          set: (d) => {
            internals.H = d;
          },
        };
      }
    }
  }
  // React 18: __SECRET_INTERNALS_* .ReactCurrentDispatcher.current
  const secret = R.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED as
    | { ReactCurrentDispatcher?: { current: Dispatcher | null } }
    | undefined;
  if (secret?.ReactCurrentDispatcher) {
    const cur = secret.ReactCurrentDispatcher;
    return {
      get: () => cur.current,
      set: (d) => {
        cur.current = d;
      },
    };
  }
  return null;
}

const ref = locate();

function forbidden(hook: string): never {
  throw new Error(
    `mugen: ${hook} is not allowed in a row component. Rows must be pure props→tree so ` +
      `they can be measured without mounting (Invariant 1). Move side effects out of the ` +
      `row, and route height-affecting state through useRow actions.`,
  );
}

const inert: Dispatcher = {
  useState: ((init: unknown) => [typeof init === 'function' ? (init as () => unknown)() : init, () => {}]) as never,
  useReducer: ((reducer: unknown, initialArg: unknown, init?: (a: unknown) => unknown) => [
    init ? init(initialArg) : initialArg,
    () => {},
  ]) as never,
  useMemo: ((factory: () => unknown) => factory()) as never,
  useCallback: ((fn: unknown) => fn) as never,
  useRef: ((init: unknown) => ({ current: init })) as never,
  useContext: ((ctx: { _currentValue?: unknown }) => (ctx ? ctx._currentValue : undefined)) as never,
  useSyncExternalStore: ((_sub: unknown, getSnapshot: () => unknown) => getSnapshot()) as never,
  useId: (() => 'mugen-measure') as never,
  useDebugValue: (() => {}) as never,
  useDeferredValue: ((v: unknown) => v) as never,
  useTransition: (() => [false, () => {}]) as never,
  useOptimistic: ((s: unknown) => [s, () => {}]) as never,
  useEffect: (() => forbidden('useEffect')) as never,
  useLayoutEffect: (() => forbidden('useLayoutEffect')) as never,
  useInsertionEffect: (() => forbidden('useInsertionEffect')) as never,
  useImperativeHandle: (() => forbidden('useImperativeHandle (ref-measured children)')) as never,
};

/** Whether the React-internals dispatcher swap is available in this build. */
export function dispatcherAvailable(): boolean {
  return ref !== null;
}

/** Run `fn` with the inert measure dispatcher installed, restoring after. */
export function runInert<R>(fn: () => R): R {
  if (!ref) return fn(); // internals unavailable: degrade (cosmetic hooks may throw)
  const previous = ref.get();
  ref.set(inert);
  try {
    return fn();
  } finally {
    ref.set(previous);
  }
}
