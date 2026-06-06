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

/** Within this many px of the bottom counts as "at the bottom". */
export const STICK_THRESHOLD_PX = 70;

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
  /** The user scrolled away from the bottom; stop sticking until they return. */
  escaped = false;

  attach(el: HTMLElement | null): void {
    if (el === this.el) return;
    this.stop();
    this.el = el;
    this.escaped = false;
    this.pointerActive = false;
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
    this.stop();
  }

  /** Finger up: stay stuck only if they let go at the bottom. */
  handleTouchEnd(threshold: number): void {
    this.pointerActive = false;
    this.escaped = this.distanceFromBottom() > threshold;
    if (this.el) this.lastScrollTop = this.el.scrollTop;
  }

  /**
   * Scroll handler — a fallback for inputs without a wheel/touch (scrollbar
   * drag, keyboard, programmatic). Ignores our own animation frames; breaks the
   * stick on an upward move and re-engages when the user returns to the bottom.
   */
  handleScroll(threshold: number): void {
    const el = this.el;
    if (!el) return;
    const st = el.scrollTop;
    const prev = this.lastScrollTop;
    this.lastScrollTop = st;
    const fromAnim = this.raf != null && Math.abs(st - this.expectedTop) <= 2;
    if (fromAnim || this.pointerActive) return;
    // Stay (or re-engage) stuck whenever we're still at the bottom. This takes
    // precedence over the downward-delta check below: when content *shrinks*
    // (e.g. a stream restarts on replay), the browser clamps scrollTop down to
    // the new, smaller max — a downward move that leaves us pinned at the
    // bottom, not a user scrolling away. Only an upward move that actually
    // leaves the bottom zone counts as the user breaking the stick.
    if (this.distanceFromBottom() <= threshold) this.escaped = false;
    else if (st < prev - 1) this.release();
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
