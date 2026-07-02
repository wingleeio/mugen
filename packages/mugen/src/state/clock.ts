/**
 * The animation clock: one rAF loop per list instance that advances every
 * active tween and reports which rows changed, so the engine can re-measure
 * them (an O(log n) Fenwick patch each) and repaint the window once per frame.
 *
 * mugen animates the *committed* height — each frame the tween writes a new
 * value, the row re-measures with it, and the same value styles the paint — so
 * painted and computed layout agree at every intermediate frame, not just at
 * the endpoints. The loop runs only while tweens are active.
 */

/** A named easing, or a custom `t -> progress` function over `[0, 1]`. */
export type MugenEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | ((t: number) => number);

export interface MugenTweenOptions {
  /** Milliseconds from retarget to settle. Default 200. `0` snaps. */
  duration?: number;
  /** Default `'ease-out'`. */
  easing?: MugenEasing;
}

export const DEFAULT_TWEEN_MS = 200;

const EASINGS: Record<Exclude<MugenEasing, (t: number) => number>, (t: number) => number> = {
  linear: (t) => t,
  'ease-in': (t) => t * t * t,
  'ease-out': (t) => 1 - (1 - t) ** 3,
  'ease-in-out': (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
};

export function resolveEasing(easing: MugenEasing | undefined): (t: number) => number {
  if (typeof easing === 'function') return easing;
  return EASINGS[easing ?? 'ease-out'];
}

/**
 * The mutable heart of one animated value. Lives in a row's slot store (so it
 * persists while the row is off-screen and unmounted); the clock mutates
 * `value` each frame, measure reads it, render paints it.
 */
export interface TweenState {
  /** The current (displayed) value — what measure and paint both use. */
  value: number;
  from: number;
  target: number;
  /** `performance.now()` at the last retarget. */
  start: number;
  duration: number;
  ease: (t: number) => number;
  active: boolean;
}

// prefers-reduced-motion, resolved once (a change mid-session just means new
// tweens snap; not worth a listener).
let reducedMotion: boolean | undefined;
export function prefersReducedMotion(): boolean {
  if (reducedMotion === undefined) {
    try {
      reducedMotion =
        typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      reducedMotion = false;
    }
  }
  return reducedMotion;
}

/** @internal Reset the reduced-motion cache (tests). */
export function resetReducedMotionCache(): void {
  reducedMotion = undefined;
}

/** Whether tweens can animate at all here (rAF exists, motion allowed). */
export function canAnimate(): boolean {
  return typeof requestAnimationFrame !== 'undefined' && !prefersReducedMotion();
}

export class AnimationClock {
  /** Active tween -> the row it belongs to. */
  private entries = new Map<TweenState, string>();
  private raf = 0;

  /** `onFrame(rowKeys)` runs once per frame with the rows whose values moved. */
  constructor(private onFrame: (rowKeys: Set<string>) => void) {}

  /** Number of active tweens (tests / diagnostics). */
  get size(): number {
    return this.entries.size;
  }

  track(rowKey: string, tween: TweenState): void {
    this.entries.set(tween, rowKey);
    this.schedule();
  }

  untrack(tween: TweenState): void {
    this.entries.delete(tween);
  }

  /** Drop every tween belonging to `rowKey` (the row was removed). */
  untrackRow(rowKey: string): void {
    for (const [tween, key] of this.entries) {
      if (key === rowKey) this.entries.delete(tween);
    }
  }

  private schedule(): void {
    if (this.raf !== 0 || this.entries.size === 0) return;
    if (typeof requestAnimationFrame === 'undefined') {
      // No frame source (SSR): settle everything immediately so heights are
      // final rather than frozen mid-flight.
      this.settleAll();
      return;
    }
    this.raf = requestAnimationFrame(this.tick);
  }

  private tick = (): void => {
    this.raf = 0;
    const now = performance.now();
    const dirty = new Set<string>();
    for (const [tween, rowKey] of this.entries) {
      const t = tween.duration <= 0 ? 1 : Math.min(1, (now - tween.start) / tween.duration);
      tween.value = tween.from + (tween.target - tween.from) * tween.ease(t);
      if (t >= 1) {
        tween.value = tween.target;
        tween.active = false;
        this.entries.delete(tween);
      }
      dirty.add(rowKey);
    }
    this.onFrame(dirty);
    this.schedule();
  };

  private settleAll(): void {
    const dirty = new Set<string>();
    for (const [tween, rowKey] of this.entries) {
      tween.value = tween.target;
      tween.active = false;
      dirty.add(rowKey);
    }
    this.entries.clear();
    this.onFrame(dirty);
  }

  /** Cancel the loop (instance teardown). Tween values stay wherever they are. */
  stop(): void {
    if (this.raf !== 0 && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.entries.clear();
  }
}
