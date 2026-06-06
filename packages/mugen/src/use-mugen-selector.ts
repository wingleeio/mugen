import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { MugenInstance, MugenScrollState } from './instance';

/**
 * Subscribe to the list's viewport/scroll state and select a slice of it,
 * Redux/Zustand-style. The component re-renders only when the *selected* value
 * changes (compared with `isEqual`, default `Object.is`) — not on every scroll
 * frame — so deriving something like `distanceFromBottom > 200` stays cheap even
 * while the list streams.
 *
 * ```tsx
 * const awayFromBottom = useMugenSelector(list, (s) => s.distanceFromBottom > 200);
 * return awayFromBottom ? <ScrollToBottomButton onClick={() => list.scrollToBottom()} /> : null;
 * ```
 */
export function useMugenSelector<T, S>(
  instance: MugenInstance<T>,
  selector: (state: MugenScrollState) => S,
  isEqual: (a: S, b: S) => boolean = Object.is,
): S {
  const subscribe = useCallback((cb: () => void) => instance.subscribeGlobal(cb), [instance]);

  // Keep the latest selector/isEqual without re-subscribing or churning getSnapshot.
  const selectorRef = useRef(selector);
  const isEqualRef = useRef(isEqual);
  selectorRef.current = selector;
  isEqualRef.current = isEqual;

  // Memoize the selection so getSnapshot returns a stable value until the
  // *selected* slice changes — `getScrollState()` already returns a stable
  // reference until the underlying state changes, so the common case is one
  // identity check.
  const last = useRef<{ state: MugenScrollState; value: S } | null>(null);
  const getSnapshot = useCallback(() => {
    const state = instance.getScrollState();
    const prev = last.current;
    if (prev && prev.state === state) return prev.value;
    const value = selectorRef.current(state);
    if (prev && isEqualRef.current(prev.value, value)) {
      last.current = { state, value: prev.value }; // selection unchanged → keep ref stable
      return prev.value;
    }
    last.current = { state, value };
    return value;
  }, [instance]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
