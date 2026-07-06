/**
 * A React Native stand-in for the scroll element mugen's engine drives.
 *
 * `MugenInstance` and `ScrollController` talk to a browser scroller through a
 * tiny structural surface — `scrollTop` (read/write), `scrollHeight`,
 * `clientHeight`, `scrollTo`, and a `style` object (`scrollBehavior` writes).
 * This adapter satisfies that surface over a React Native `ScrollView`:
 *
 * - `scrollTop` reads come from the last `onScroll` event (RN has no
 *   synchronous scroll-position read), plus optimistic updates on writes so the
 *   spring's read-modify-write loop integrates against its own output instead
 *   of a stale bridge value.
 * - `scrollTop` writes call `scrollTo({ animated: false })`.
 * - `scrollHeight` is the content height mugen itself computed (`totalHeight`),
 *   `clientHeight` the viewport from `onLayout` — both exact, no measurement.
 * - `style.scrollBehavior` writes land in a plain object and are ignored;
 *   smoothness on RN comes from `scrollTo({ animated: true })` or the spring.
 *
 * The adapter is handed to the engine `as unknown as HTMLElement`; nothing in
 * the engine's runtime path touches anything beyond this surface (verified
 * against instance.ts / scroll-controller.ts / vlist.tsx).
 */
export class NativeScrollElement {
  /** Last known scroll offset (from onScroll, or optimistic after a write). */
  private top = 0;
  /** Content height (mugen's computed total — slots included). */
  contentHeight = 0;
  /** Viewport height from onLayout. */
  viewportHeight = 0;
  /** The imperative hook into the ScrollView (null until the ref attaches). */
  scrollFn: ((y: number, animated: boolean) => void) | null = null;
  /** Absorbs `style.scrollBehavior` writes from `setScrollTopInstant`. */
  readonly style: Record<string, unknown> = {};

  get scrollTop(): number {
    return this.top;
  }

  set scrollTop(value: number) {
    const max = Math.max(0, this.contentHeight - this.viewportHeight);
    const next = Math.min(Math.max(0, value), max);
    this.top = next;
    this.scrollFn?.(next, false);
  }

  get scrollHeight(): number {
    return this.contentHeight;
  }

  get clientHeight(): number {
    return this.viewportHeight;
  }

  scrollTo(options?: { top?: number; behavior?: string } | number, y?: number): void {
    // Support both the options-object and (x, y) DOM signatures the engine uses.
    if (typeof options === 'number') {
      this.scrollTop = y ?? 0;
      return;
    }
    const target = options?.top ?? 0;
    if (options?.behavior === 'smooth') {
      // Let the platform animate; onScroll events will converge `top`.
      const max = Math.max(0, this.contentHeight - this.viewportHeight);
      const next = Math.min(Math.max(0, target), max);
      this.top = next;
      this.scrollFn?.(next, true);
    } else {
      this.scrollTop = target;
    }
  }

  /** Feed a real scroll event's offset in (the ground truth). */
  onNativeScroll(offsetY: number): void {
    this.top = offsetY;
  }
}
