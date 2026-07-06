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

export const StyleSheet = {
  create: <T,>(styles: T): T => styles,
  flatten: (style: unknown): unknown => style,
};

export const Platform = {
  OS: 'ios',
  select: (obj: Record<string, unknown>) => obj['ios'] ?? obj['default'],
};

export function Pressable(props: AnyProps) {
  return createElement('rn-pressable', props, props.children);
}

/** URLs opened via Linking, so tests can assert on link taps. */
export const openedUrls: string[] = [];
export const Linking = {
  openURL: async (url: string) => {
    openedUrls.push(url);
  },
};

/** Minimal Animated stand-in: values are inert, timings complete synchronously. */
class AnimatedValue {
  constructor(private v: number) {}
  setValue(v: number): void {
    this.v = v;
  }
  interpolate(): AnimatedValue {
    return this;
  }
}
export const Animated = {
  // Distinct host tags so tests can detect what's animated.
  View: (props: AnyProps) => createElement('rn-animated-view', props, props.children),
  Text: (props: AnyProps) => createElement('rn-animated-text', props, props.children),
  Value: AnimatedValue,
  timing: (_value: unknown, _config: unknown) => ({
    start: (cb?: (r: { finished: boolean }) => void) => cb?.({ finished: true }),
  }),
};
