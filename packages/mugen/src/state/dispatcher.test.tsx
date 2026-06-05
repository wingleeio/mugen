import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { dispatcherAvailable, runInert } from './dispatcher';

describe('measure dispatcher', () => {
  it('locates the React internals dispatcher', () => {
    expect(dispatcherAvailable()).toBe(true);
  });

  it('cosmetic useState returns its initial value (lazy init supported)', () => {
    const Comp = () => {
      const [n] = useState(7);
      const [m] = useState(() => 9);
      return n + m;
    };
    let out = 0;
    runInert(() => {
      out = (Comp as unknown as () => number)();
    });
    expect(out).toBe(16);
  });

  it('useMemo computes, useRef boxes, useContext reads default', () => {
    const Ctx = createContext('default');
    const Comp = () => {
      const m = useMemo(() => 1 + 1, []);
      const r = useRef('x');
      const c = useContext(Ctx);
      return `${m}-${r.current}-${c}`;
    };
    let out = '';
    runInert(() => {
      out = (Comp as unknown as () => string)();
    });
    expect(out).toBe('2-x-default');
  });

  it('throws if a row uses useEffect (would need mounting)', () => {
    const Comp = () => {
      useEffect(() => {}, []);
      return null;
    };
    expect(() => runInert(() => (Comp as unknown as () => null)())).toThrow(/useEffect/);
  });

  it('restores the previous dispatcher afterward', () => {
    runInert(() => {});
    // Outside runInert, calling a hook must still throw React's invalid-hook error.
    expect(() => useState(0)).toThrow();
  });
});
