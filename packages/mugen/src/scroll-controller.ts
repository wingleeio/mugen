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

export class ScrollController {
  private el: HTMLElement | null = null;
  private raf: number | null = null;
  private velocity = 0;
  private lastTick = 0;
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

  /** A wheel/trackpad gesture. Scrolling up (deltaY < 0) breaks the stick now. */
  handleWheel(deltaY: number): void {
    if (deltaY < 0) this.release();
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
    if (movedUp) {
      // Scrolled up → break. Exception: a content-shrink clamp (e.g. replay)
      // also drops scrollTop, but leaves us pinned at the bottom (dist ≈ 0).
      if (dist > AT_BOTTOM_PX) this.release();
    } else if (st > prev + 1 && dist <= threshold) {
      // Re-engage only on a real *downward* move back into the bottom zone — not
      // on a stationary/noise event, which would otherwise let a slow scroll-up
      // re-stick between its own steps.
      this.escaped = false;
    }
  }

  private release(): void {
    this.escaped = true;
    this.stop();
  }

  // ── Scrolling to the bottom ────────────────────────────────────────────────

  /** Jump to the bottom immediately and re-engage sticking. */
  jumpToBottom(): void {
    const el = this.el;
    if (!el) return;
    this.stop();
    el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
    this.expectedTop = el.scrollTop;
    this.lastScrollTop = el.scrollTop;
    this.escaped = false;
  }

  jumpToTop(): void {
    const el = this.el;
    if (!el) return;
    this.stop();
    el.scrollTop = 0;
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
    const diff = target - el.scrollTop;
    if (diff <= 0.5) {
      el.scrollTop = target;
      this.expectedTop = target;
      this.velocity = 0;
      return;
    }
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    const tickDelta = this.lastTick ? Math.min(4, (now - this.lastTick) / FRAME_MS) : 1;
    this.lastTick = now;
    this.velocity = (spring.damping * this.velocity + spring.stiffness * diff) / spring.mass;
    const next = Math.min(target, el.scrollTop + this.velocity * tickDelta);
    el.scrollTop = next;
    this.expectedTop = next;
    this.raf = requestAnimationFrame(() => this.tick(spring));
  }

  stop(): void {
    if (this.raf != null) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
    this.velocity = 0;
  }
}
