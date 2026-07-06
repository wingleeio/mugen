/**
 * A minimal `react-native` stand-in for Node tests. Host components render as
 * plain string-typed elements (react-test-renderer handles those natively);
 * behavior that would come from the platform — layout, scrolling — is driven
 * by tests invoking `onLayout` / `onScroll` props directly, exactly how the
 * real events would arrive.
 */
import { createElement, forwardRef, useImperativeHandle, type ReactNode } from 'react';

type AnyProps = Record<string, unknown> & { children?: ReactNode };

export function View(props: AnyProps) {
  return createElement('rn-view', props, props.children);
}

export function Text(props: AnyProps) {
  return createElement('rn-text', props, props.children);
}

/** Records imperative scrollTo calls so tests can assert on them. */
export const scrollToCalls: { y?: number; animated?: boolean }[] = [];

export const ScrollView = forwardRef(function ScrollView(props: AnyProps, ref) {
  useImperativeHandle(ref, () => ({
    scrollTo: (opts: { y?: number; animated?: boolean }) => {
      scrollToCalls.push(opts);
    },
  }));
  return createElement('rn-scrollview', props, props.children);
});

/** Animated stand-in: values hold numbers, `event` unwraps to its listener,
 *  timings apply instantly. Enough for the indicator + native-driver scroll
 *  wiring to render and for tests to keep firing `onScroll` directly. */
class AnimatedValueStub {
  constructor(private v: number) {}
  setValue(v: number): void {
    this.v = v;
  }
  interpolate(): AnimatedValueStub {
    return this;
  }
}

export const Animated = {
  Value: AnimatedValueStub,
  View: (props: AnyProps) => createElement('rn-animated-view', props, props.children),
  ScrollView: forwardRef(function AnimatedScrollView(props: AnyProps, ref) {
    useImperativeHandle(ref, () => ({
      scrollTo: (opts: { y?: number; animated?: boolean }) => {
        scrollToCalls.push(opts);
      },
    }));
    return createElement('rn-scrollview', props, props.children);
  }),
  event:
    (_mapping: unknown, cfg?: { listener?: (e: unknown) => void }) =>
    (e: unknown) => {
      cfg?.listener?.(e);
    },
  timing: (_v: unknown, _cfg: unknown) => ({ start: () => {} }),
};

export const StyleSheet = {
  create: <T,>(styles: T): T => styles,
  flatten: (style: unknown): unknown => style,
};

export const Platform = {
  OS: 'ios',
  select: (obj: Record<string, unknown>) => obj['ios'] ?? obj['default'],
};
