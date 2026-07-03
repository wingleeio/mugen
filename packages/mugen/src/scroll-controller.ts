/**
 * Smooth scroll controller for `MugenVList` — powers `initialScroll` and
 * `stickToBottom`. It animates a scroll element toward the bottom with a
 * velocity-based spring (the same shape as stackblitz's use-stick-to-bottom),
 * so streaming content stays pinned smoothly.
 *
 * Interrupting is the subtle part. While the spring is running it keeps writing
 * `scrollTop` every frame, so a real (many-tiny-deltas) scroll-up gets pulled
 * back before a scroll-position handler can react. So we break the stick from
 * the user's *input* — `wheel` (deltaY < 0) and touch drags — not from where
 * the scrollbar ends up. Returning to the bottom re-engages.
 */

export type MugenScrollEase = 'instant' | 'smooth';

export interface SpringOptions {
  /** Retains velocity frame-to-frame (higher = more glide). */
  damping: number;
  /** Pull toward the target (higher = snappier). */
  stiffness: number;
  /** Inertia (higher = slower to start/stop). */
  mass: number;
}

/** Defaults tuned to match use-stick-to-bottom's "smooth" feel. */
export const DEFAULT_SPRING: SpringOptions = { damping: 0.7, stiffness: 0.05, mass: 1.25 };

/** Returning downward to within this many px of the bottom re-engages the stick. */
export const STICK_THRESHOLD_PX = 70;

/** Treat as exactly pinned to the bottom — distinguishes a user scroll-up from a
 *  content-shrink clamp (which drops scrollTop but leaves us at the bottom). */
const AT_BOTTOM_PX = 2;

const FRAME_MS = 1000 / 60;

/** Cap on simulated frames per tick — a long main-thread hitch catches up over
 *  a couple of writes instead of teleporting. */
const MAX_CATCHUP_FRAMES = 8;

/** After reaching the bottom, keep the spring loop warm this long. Streaming
 *  growth arrives in discrete steps (a wrapped line at a time); if the loop
 *  parked between steps, every step would re-accelerate from velocity 0 — a
 *  stop-go pulse that reads as vertical jitter, worst on narrow (mobile)
 *  viewports where lines wrap often. Warm, the next step resumes from cruise. */
const SETTLE_GRACE_MS = 500;

/** EMA rate for the target-growth estimate (per simulated frame). A pure
 *  P-spring trails continuously growing content by ~11× the per-frame growth
 *  rate — during fast streaming that is 50–120px, which clips the trailing
 *  caret below the fold. Feeding the (smoothed) growth rate forward into the
 *  position step makes the steady-state lag ~0 while the spring, at its stock
 *  gains, only ever handles the residual — so tracking tightens without the
 *  surge a stiffer spring would add under dropped frames. */
const GROWTH_EMA = 0.12;

export function setScrollTopInstant(el: HTMLElement, top: number): void {
  const prev = el.style.scrollBehavior;
  el.style.scrollBehavior = 'auto';
  el.scrollTop = top;
  el.style.scrollBehavior = prev;
}

export class ScrollController {
  private el: HTMLElement | null = null;
  private raf: number | null = null;
  private velocity = 0;
  private lastTick = 0;
  /** When the spring first found itself pinned at the bottom (0 = moving). */
  private settledSince = 0;
  /** Smoothed target growth (px per simulated frame) — the feed-forward term. */
  private targetVel = 0;
  private lastTarget = -1;
  /** scrollTop our animation last wrote — lets onScroll tell us from the user. */
  private expectedTop = 0;
  private lastScrollTop = 0;
  /** A touch drag is in progress — don't fight the finger. */
  private pointerActive = false;
  /** The current touch drag has moved up at least once (so it breaks the stick
   *  even if the finger lifts back near the bottom). */
  private movedUpWhilePointer = false;
  /** The user scrolled away from the bottom; stop sticking until they return. */
  escaped = false;

  attach(el: HTMLElement | null): void {
    if (el === this.el) return;
    this.stop();
    this.el = el;
    this.escaped = false;
    this.pointerActive = false;
    this.movedUpWhilePointer = false;
    this.lastScrollTop = el ? el.scrollTop : 0;
  }

  /** Distance from the bottom in px (0 = pinned). */
  distanceFromBottom(): number {
    const el = this.el;
    if (!el) return 0;
    return el.scrollHeight - el.clientHeight - el.scrollTop;
  }

  /** Is the list scrollable past the viewport yet (i.e. measured)? */
  hasOverflow(): boolean {
    const el = this.el;
    return !!el && el.scrollHeight - el.clientHeight > 0 && el.clientHeight > 0;
  }

  // ── Interrupting from user input (reliable mid-animation) ──────────────────

  /** A wheel/trackpad gesture. Scrolling up (deltaY < 0) breaks the stick now.
   *  Only once the list actually overflows: before that there's nothing to scroll
   *  away from, no scroll event will ever fire to re-engage, and a stray wheel-up
   *  would otherwise disable the stick for good. */
  handleWheel(deltaY: number): void {
    if (deltaY < 0 && this.hasOverflow()) this.release();
  }

  /** Finger down: stop the animation so it doesn't fight the drag. */
  handleTouchStart(): void {
    this.pointerActive = true;
    this.movedUpWhilePointer = false;
    this.stop();
  }

  /** Finger up: stay stuck only if the drag never pulled up and ends at the bottom. */
  handleTouchEnd(threshold: number): void {
    this.pointerActive = false;
    this.escaped = this.movedUpWhilePointer || this.distanceFromBottom() > threshold;
    this.movedUpWhilePointer = false;
    if (this.el) this.lastScrollTop = this.el.scrollTop;
  }

  /**
   * Scroll handler — the fallback for inputs without a wheel event (scrollbar
   * drag, keyboard) and the bookkeeper during touch drags. Ignores our own
   * animation frames; breaks the stick on any upward move and re-engages only
   * when the user returns *downward* toward the bottom.
   */
  handleScroll(threshold: number): void {
    const el = this.el;
    if (!el) return;
    const st = el.scrollTop;
    const prev = this.lastScrollTop;
    this.lastScrollTop = st;
    const fromAnim = this.raf != null && Math.abs(st - this.expectedTop) <= 2;
    if (fromAnim) return;
    const movedUp = st < prev - 1;
    // A touch drag drives the scroll itself and the spring is already stopped —
    // just remember if the finger pulled up, so touchEnd won't snap back.
    if (this.pointerActive) {
      if (movedUp) this.movedUpWhilePointer = true;
      return;
    }
    const dist = this.distanceFromBottom();
    if (dist <= AT_BOTTOM_PX) {
      // Pinned at the bottom — however we got here, including a content-shrink
      // clamp from a replay/regenerate that drops scrollTop onto the new max.
      // Being at the bottom *is* stuck, so (re-)engage even if we had escaped. A
      // real scroll-up moves more than a hair before any at-bottom event, so
      // this can't swallow one.
      this.escaped = false;
    } else if (movedUp) {
      // Scrolled up away from the bottom → break the stick.
      this.release();
    } else if (st > prev + 1 && dist <= threshold) {
      // A real *downward* move back into the bottom zone re-engages — but not a
      // stationary/noise event, which would otherwise let a slow scroll-up
      // re-stick between its own steps.
      this.escaped = false;
    }
  }

  /** Break the stick now — a user gesture or a programmatic scroll away from
   *  the bottom (`scrollToIndex`). Without this the spring keeps writing
   *  `scrollTop` every frame while content streams (and for a grace window
   *  after), which cancels a native smooth scroll before it moves a pixel. */
  escape(): void {
    this.escaped = true;
    this.stop();
  }

  private release(): void {
    this.escape();
  }

  // ── Scrolling to the bottom ────────────────────────────────────────────────

  /** Jump to the bottom immediately and re-engage sticking. */
  jumpToBottom(): void {
    const el = this.el;
    if (!el) return;
    this.stop();
    setScrollTopInstant(el, Math.max(0, el.scrollHeight - el.clientHeight));
    this.expectedTop = el.scrollTop;
    this.lastScrollTop = el.scrollTop;
    this.escaped = false;
  }

  jumpToTop(): void {
    const el = this.el;
    if (!el) return;
    this.stop();
    setScrollTopInstant(el, 0);
    this.expectedTop = 0;
    this.lastScrollTop = 0;
  }

  /** Spring toward the bottom. No-op if escaped, dragging, or already there. */
  springToBottom(spring: SpringOptions): void {
    if (this.escaped || this.pointerActive || !this.el || this.distanceFromBottom() <= 0.5) return;
    if (this.raf == null) {
      this.lastTick = 0;
      this.raf = requestAnimationFrame(() => this.tick(spring));
    }
  }

  private tick(spring: SpringOptions): void {
    const el = this.el;
    this.raf = null;
    if (!el || this.escaped || this.pointerActive) return;
    const target = el.scrollHeight - el.clientHeight;
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    let frames = this.lastTick ? Math.min(MAX_CATCHUP_FRAMES, (now - this.lastTick) / FRAME_MS) : 1;
    this.lastTick = now;
    // Integrate the spring in (fractional) frame-sized substeps so it is
    // frame-rate independent: a dropped frame advances the same dynamics
    // further, instead of warping them. The old once-per-rAF recurrence
    // alternated lag (one velocity update for 3 frames of time) and surge
    // (the grown diff over-accelerating the next update) under load — which
    // reads as vertical jitter on mobile. At a steady 60Hz (h = 1) this is
    // exactly the original recurrence.
    // Track how fast the bottom itself is moving (streamed content growing).
    const grew = this.lastTarget >= 0 ? target - this.lastTarget : 0;
    this.lastTarget = target;
    if (grew < -1) {
      this.targetVel = 0; // content shrank (replay/reset) — stop feeding forward
    } else {
      const observed = Math.max(0, grew) / Math.max(frames, 0.25);
      this.targetVel += GROWTH_EMA * (observed - this.targetVel);
    }
    // While content streams, ride a rate-scaled buffer behind the bottom
    // instead of hugging it: growth lands in discrete line-sized steps, so
    // tracking closer than ~one step forces stop-go motion. Riding about a
    // wrapped line back keeps velocity continuous while the trailing caret
    // stays above the fold; the buffer vanishes as growth stops, so the list
    // still settles flush.
    const ride = Math.min(32, this.targetVel * 9);
    const chase = target - ride;
    let pos = el.scrollTop;
    let v = this.velocity;
    while (frames > 0) {
      const h = Math.min(1, frames);
      frames -= h;
      const diff = Math.max(0, chase - pos);
      v += h * ((spring.damping * v + spring.stiffness * diff) / spring.mass - v);
      pos = Math.min(target, pos + (v + this.targetVel) * h);
    }
    this.velocity = v;
    const next = target - pos <= 0.5 ? target : pos;
    el.scrollTop = next;
    this.expectedTop = next;
    if (next >= target) {
      // At the bottom. Idle for a grace window (velocity decaying through the
      // same dynamics) so a growth step landing mid-stream resumes from speed;
      // park only once the content has stopped growing for a while.
      if (this.settledSince === 0) this.settledSince = now;
      if (now - this.settledSince >= SETTLE_GRACE_MS && v < 0.05 && this.targetVel < 0.05) {
        this.velocity = 0;
        this.settledSince = 0;
        this.targetVel = 0;
        this.lastTarget = -1;
        return;
      }
    } else {
      this.settledSince = 0;
    }
    this.raf = requestAnimationFrame(() => this.tick(spring));
  }

  stop(): void {
    if (this.raf != null) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
    this.velocity = 0;
    this.settledSince = 0;
    this.targetVel = 0;
    this.lastTarget = -1;
  }
}
