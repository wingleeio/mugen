import { describe, expect, it } from 'vitest';
import { ScrollController, STICK_THRESHOLD_PX, DEFAULT_SPRING } from './scroll-controller';

/** A minimal stand-in for the scroll element (only the geometry we read). */
function fakeEl(scrollHeight: number, clientHeight: number, scrollTop = 0): HTMLElement {
  return { scrollHeight, clientHeight, scrollTop } as unknown as HTMLElement;
}

describe('ScrollController', () => {
  it('reports distance from the bottom and overflow', () => {
    const c = new ScrollController();
    c.attach(fakeEl(1000, 400, 600));
    expect(c.distanceFromBottom()).toBe(0);
    expect(c.hasOverflow()).toBe(true);

    c.attach(fakeEl(1000, 400, 500));
    expect(c.distanceFromBottom()).toBe(100);

    const flat = new ScrollController();
    flat.attach(fakeEl(300, 400, 0));
    expect(flat.hasOverflow()).toBe(false);
  });

  it('jumps to the bottom and re-engages sticking', () => {
    const c = new ScrollController();
    const el = fakeEl(1000, 400, 0);
    c.attach(el);
    c.escaped = true;
    c.jumpToBottom();
    expect(el.scrollTop).toBe(600); // scrollHeight - clientHeight
    expect(c.escaped).toBe(false);
  });

  it('releases when the user scrolls past the threshold, re-engages at the bottom', () => {
    const c = new ScrollController();
    const el = fakeEl(1000, 400, 600); // pinned at the bottom
    c.attach(el);
    expect(c.escaped).toBe(false);

    // User scrolls up well past the "near bottom" threshold → release.
    el.scrollTop = 600 - (STICK_THRESHOLD_PX + 50);
    c.handleScroll(STICK_THRESHOLD_PX);
    expect(c.escaped).toBe(true);

    // User scrolls back within the threshold → re-engage.
    el.scrollTop = 600 - 10;
    c.handleScroll(STICK_THRESHOLD_PX);
    expect(c.escaped).toBe(false);
  });

  it('breaks the stick on a slow scroll up that stays within the threshold', () => {
    const c = new ScrollController();
    const el = fakeEl(1000, 400, 600); // pinned at the bottom
    c.attach(el);
    // Nudge up only 30px — still inside STICK_THRESHOLD_PX (70) — but it must
    // still break, or the spring would overpower the user's slow scroll.
    el.scrollTop = 570;
    c.handleScroll(STICK_THRESHOLD_PX);
    expect(c.escaped).toBe(true);
  });

  it('re-engages only on a downward move, never on a stationary/noise event', () => {
    const c = new ScrollController();
    const el = fakeEl(1000, 400, 600);
    c.attach(el);
    el.scrollTop = 570; // scroll up → escape (dist 30, within threshold)
    c.handleScroll(STICK_THRESHOLD_PX);
    expect(c.escaped).toBe(true);
    // A no-move scroll event near the bottom must NOT re-stick (the slow-scroll bug).
    c.handleScroll(STICK_THRESHOLD_PX);
    expect(c.escaped).toBe(true);
    // Only a real downward move back toward the bottom re-engages.
    el.scrollTop = 595;
    c.handleScroll(STICK_THRESHOLD_PX);
    expect(c.escaped).toBe(false);
  });

  it('stays stuck when content shrinks and clamps scrollTop (e.g. replay)', () => {
    const c = new ScrollController();
    const el = fakeEl(1000, 400, 600); // pinned at the bottom
    c.attach(el);
    expect(c.escaped).toBe(false);

    // A live turn restarts and collapses: scrollHeight drops, so the browser
    // clamps scrollTop down to the new max. That's a downward move, but we're
    // still at the new bottom — it must not be mistaken for a user scroll-up.
    const geom = el as unknown as { scrollHeight: number; scrollTop: number };
    geom.scrollHeight = 700;
    geom.scrollTop = 300; // 700 - 400, the clamped max
    c.handleScroll(STICK_THRESHOLD_PX);
    expect(c.distanceFromBottom()).toBe(0);
    expect(c.escaped).toBe(false);
  });

  it('re-engages a stale escape when a shrink clamps back to the bottom (replay)', () => {
    const c = new ScrollController();
    const el = fakeEl(1000, 400, 600); // pinned at the bottom
    c.attach(el);

    // User scrolls up to re-read → escapes the stick.
    el.scrollTop = 500; // dist 100
    c.handleScroll(STICK_THRESHOLD_PX);
    expect(c.escaped).toBe(true);

    // They press Replay: the live turn collapses, scrollHeight drops, and the
    // browser clamps scrollTop onto the new (smaller) max — landing them at the
    // bottom. The stale escape must clear so the new stream sticks again.
    const geom = el as unknown as { scrollHeight: number; scrollTop: number };
    geom.scrollHeight = 700;
    geom.scrollTop = 300; // 700 - 400, the clamped max (at the bottom)
    c.handleScroll(STICK_THRESHOLD_PX);
    expect(c.distanceFromBottom()).toBe(0);
    expect(c.escaped).toBe(false);
  });

  it('attaching a new element resets the escaped state', () => {
    const c = new ScrollController();
    c.attach(fakeEl(1000, 400, 0));
    c.escaped = true;
    c.attach(fakeEl(1000, 400, 0));
    expect(c.escaped).toBe(false);
  });

  // ── Interrupting the stick (the part that fights a running spring) ──

  it('breaks the stick on an upward wheel, ignores a downward one', () => {
    const c = new ScrollController();
    c.attach(fakeEl(1000, 400, 600));
    c.handleWheel(40); // scrolling down — no change
    expect(c.escaped).toBe(false);
    c.handleWheel(-40); // scrolling up — release
    expect(c.escaped).toBe(true);
  });

  it('ignores an upward wheel while the list does not overflow yet', () => {
    const c = new ScrollController();
    const el = fakeEl(300, 400, 0); // a short chat: content shorter than the viewport
    c.attach(el);
    // Nothing can scroll, so no scroll event will ever fire to re-engage; an
    // idle wheel-up here must not break the stick for the rest of the session.
    c.handleWheel(-40);
    expect(c.escaped).toBe(false);
    // Once content streams past the viewport, an upward wheel breaks as usual.
    (el as unknown as { scrollHeight: number }).scrollHeight = 1000;
    c.handleWheel(-40);
    expect(c.escaped).toBe(true);
  });

  it('a touch drag suppresses sticking; releasing away from the bottom stays escaped', () => {
    const c = new ScrollController();
    const el = fakeEl(1000, 400, 600);
    c.attach(el);
    c.handleTouchStart();
    // The spring must not fight the finger while it's down.
    c.springToBottom(DEFAULT_SPRING);
    el.scrollTop = 200; // dragged up
    expect(el.scrollTop).toBe(200); // springToBottom was a no-op
    c.handleTouchEnd(STICK_THRESHOLD_PX);
    expect(c.escaped).toBe(true);
  });

  it('releasing a touch at the bottom keeps it stuck', () => {
    const c = new ScrollController();
    const el = fakeEl(1000, 400, 600); // at the bottom
    c.attach(el);
    c.handleTouchStart();
    c.handleTouchEnd(STICK_THRESHOLD_PX);
    expect(c.escaped).toBe(false);
  });

  it('an upward touch drag breaks the stick even when the finger lifts near the bottom', () => {
    const c = new ScrollController();
    const el = fakeEl(1000, 400, 600); // at the bottom
    c.attach(el);
    c.handleTouchStart();
    el.scrollTop = 540; // finger drags up (dist 60)
    c.handleScroll(STICK_THRESHOLD_PX); // recorded as an upward move during the drag
    el.scrollTop = 595; // eases back to dist 5 — within threshold — before lifting
    c.handleScroll(STICK_THRESHOLD_PX);
    c.handleTouchEnd(STICK_THRESHOLD_PX);
    // Without tracking the up-move, releasing at dist 5 would snap back. It must not.
    expect(c.escaped).toBe(true);
  });

  it('springToBottom is a no-op once escaped', () => {
    const c = new ScrollController();
    const el = fakeEl(1000, 400, 0); // at the top, would normally spring down
    c.attach(el);
    c.handleWheel(-10); // user scrolled up → escaped
    c.springToBottom(DEFAULT_SPRING);
    expect(el.scrollTop).toBe(0); // never started chasing the bottom
  });
});
