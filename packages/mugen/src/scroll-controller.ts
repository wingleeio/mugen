/**
 * Smooth scroll controller for `MugenVList` — powers `initialScroll` and
 * `stickToBottom`. It animates a scroll element toward the bottom with a
 * velocity-based spring (the same shape as stackblitz's use-stick-to-bottom),
 * so streaming content stays pinned smoothly, and releases the moment the user
 * scrolls away — re-engaging when they return to the bottom.
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
  /** The user scrolled away from the bottom; stop sticking until they return. */
  escaped = false;

  attach(el: HTMLElement | null): void {
    if (el === this.el) return;
    this.stop();
    this.el = el;
    this.escaped = false;
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

  /**
   * Call from the scroll handler. Distinguishes our own animation frames from
   * real user input by comparing against the position we last wrote, then sets
   * `escaped` from how far the user has moved off the bottom.
   */
  handleScroll(threshold: number): void {
    const el = this.el;
    if (!el) return;
    const fromAnim = this.raf != null && Math.abs(el.scrollTop - this.expectedTop) < 2;
    if (fromAnim) return;
    this.escaped = this.distanceFromBottom() > threshold;
    if (this.escaped) this.stop();
  }

  /** Jump to the bottom immediately and re-engage sticking. */
  jumpToBottom(): void {
    const el = this.el;
    if (!el) return;
    this.stop();
    el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
    this.expectedTop = el.scrollTop;
    this.escaped = false;
  }

  jumpToTop(): void {
    const el = this.el;
    if (!el) return;
    this.stop();
    el.scrollTop = 0;
    this.expectedTop = 0;
  }

  /** Spring toward the bottom. No-op if the user escaped or we're already there. */
  springToBottom(spring: SpringOptions): void {
    if (this.escaped || !this.el || this.distanceFromBottom() <= 0.5) return;
    if (this.raf == null) {
      this.lastTick = 0;
      this.raf = requestAnimationFrame(() => this.tick(spring));
    }
  }

  private tick(spring: SpringOptions): void {
    const el = this.el;
    this.raf = null;
    if (!el || this.escaped) return;
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
