import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Animated } from 'react-native';
import {
  markPrimitive,
  measureChildren,
  toChildArray,
  naturalWidthOf,
  canAnimate,
  prefersReducedMotion,
} from '@wingleeio/mugen/native-core';

/**
 * Streaming fade-in, the React Native way.
 *
 * The web `FadeMarkdown` paints a canvas veil over just-arrived *characters*
 * and dissolves it. RN has no canvas, so the native version animates at the
 * next granularity that exists here: the **line fragments** RichText paints.
 * A fragment that mounts *after* the subtree's first commit (i.e. a line that
 * appeared because the stream grew) starts at opacity 0 and fades in; text
 * appended to an existing line keeps its element (stable key) and never
 * flickers. Heights are untouched — opacity only.
 *
 * Differences from the web, by design: fade granularity is per new line rather
 * than per character, and there's no adaptive cadence — a fixed short ramp.
 */
interface FadeScope {
  /** False during the subtree's initial mount; armed after the first commit. */
  armed: { current: boolean };
}

const FadeContext = createContext<FadeScope | null>(null);

const FADE_MS = 180;

/**
 * Wraps one painted RichText fragment. Inert unless inside an armed
 * `FadeMarkdown` (so scrolling a settled row into view never re-fades it).
 */
export function FadeLine(props: { children: ReactNode }): ReactElement {
  const scope = useContext(FadeContext);
  // Captured once, at mount: a fragment fades only if it *appeared* while the
  // scope was armed (i.e. it streamed in). Later re-renders of already-visible
  // fragments (the scope is armed by then) must not re-fade them.
  const armedAtMount = useRef<boolean | null>(null);
  if (armedAtMount.current === null) armedAtMount.current = scope !== null && scope.armed.current;
  const fade = armedAtMount.current && canAnimate() && !prefersReducedMotion();
  const opacityRef = useRef<Animated.Value | null>(null);
  const startedRef = useRef(false);
  if (fade && opacityRef.current === null) opacityRef.current = new Animated.Value(0);

  useEffect(() => {
    if (!fade || startedRef.current || opacityRef.current === null) return;
    startedRef.current = true;
    Animated.timing(opacityRef.current, {
      toValue: 1,
      duration: FADE_MS,
      useNativeDriver: true,
    }).start();
  }, [fade]);

  if (!fade || opacityRef.current === null) return <>{props.children}</>;
  // A zero-size, non-clipping wrapper: the absolutely-positioned fragment
  // inside still lands at its pretext (left, top) relative to the flow box.
  return <Animated.View style={{ opacity: opacityRef.current }}>{props.children}</Animated.View>;
}

function FadeMarkdownComponent(props: { children?: ReactNode }): ReactElement {
  const scopeRef = useRef<FadeScope | null>(null);
  if (scopeRef.current === null) scopeRef.current = { armed: { current: false } };
  useEffect(() => {
    // Everything mounted in the first commit was already there — only content
    // that arrives afterwards (the stream) should fade.
    scopeRef.current!.armed.current = true;
  }, []);
  return <FadeContext.Provider value={scopeRef.current}>{props.children}</FadeContext.Provider>;
}
FadeMarkdownComponent.displayName = 'FadeMarkdown';

/** Measures exactly as its children (the fade is paint-only). */
export const FadeMarkdown = markPrimitive(
  FadeMarkdownComponent as (props: { children?: ReactNode }) => ReactElement,
  {
    name: 'FadeMarkdown',
    measure: (props, ctx) => measureChildren((props as { children?: ReactNode }).children, ctx),
    naturalWidth: (props, ctx) => {
      let max = 0;
      for (const child of toChildArray((props as { children?: ReactNode }).children)) {
        const w = naturalWidthOf(child, ctx);
        if (w == null) return null;
        max = Math.max(max, w);
      }
      return max;
    },
  },
);
