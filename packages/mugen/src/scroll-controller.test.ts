import { describe, expect, it } from 'vitest';
import { ScrollController, STICK_THRESHOLD_PX } from './scroll-controller';

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

  it('attaching a new element resets the escaped state', () => {
    const c = new ScrollController();
    c.attach(fakeEl(1000, 400, 0));
    c.escaped = true;
    c.attach(fakeEl(1000, 400, 0));
    expect(c.escaped).toBe(false);
  });
});
