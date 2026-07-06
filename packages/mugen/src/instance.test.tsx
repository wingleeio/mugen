import { describe, expect, it, vi } from 'vitest';

// Fixed 20px-per-row measurement, so totals are easy to reason about.
vi.mock('@chenglou/pretext', () => ({
  prepare: vi.fn((text: string) => ({ __text: text })),
  layout: vi.fn(() => ({ height: 20, lineCount: 1 })),
  clearCache: vi.fn(),
}));

import { MugenInstance } from './instance';
import { Text } from './primitives/text';

function makeInstance(n: number): MugenInstance<{ id: string }> {
  const inst = new MugenInstance<{ id: string }>();
  inst.setItems(Array.from({ length: n }, (_, i) => ({ id: String(i) })));
  inst.configure({
    getKey: (it) => it.id,
    render: () => <Text font="16px Inter">row</Text>,
    defaults: { font: '16px Inter', lineHeight: 20 },
  });
  inst.setViewport(300, 100, 16); // width, height, rootPx
  inst.sync();
  return inst;
}

describe('MugenInstance scroll state', () => {
  it('computes distanceFromBottom and returns a stable snapshot until inputs change', () => {
    const inst = makeInstance(50); // 50 × 20px = 1000px total, viewport 100
    const s1 = inst.getScrollState();
    expect(s1.totalHeight).toBe(1000);
    expect(s1.viewportHeight).toBe(100);
    expect(s1.distanceFromBottom).toBe(900); // 1000 - 100 - 0
    expect(inst.getScrollState()).toBe(s1); // referentially stable

    inst.setScrollTop(900);
    const s2 = inst.getScrollState();
    expect(s2).not.toBe(s1);
    expect(s2.distanceFromBottom).toBe(0); // 1000 - 100 - 900, clamped at 0
  });

  it('setScrollTop notifies global subscribers and dedupes equal values', () => {
    const inst = makeInstance(10);
    let calls = 0;
    inst.subscribeGlobal(() => calls++);
    inst.setScrollTop(50);
    expect(calls).toBe(1);
    inst.setScrollTop(50); // unchanged → no notify
    expect(calls).toBe(1);
    inst.setScrollTop(80);
    expect(calls).toBe(2);
  });

  it('memoizes row heights by item identity: an append re-walks only the new row', async () => {
    const { layout } = await import('@chenglou/pretext');
    const inst = makeInstance(50);
    const before = vi.mocked(layout).mock.calls.length;
    const items = Array.from({ length: 51 }, (_, i) => ({ id: String(i) }));
    // Keep the first 50 item identities? makeInstance created its own array —
    // rebuild with fresh identities for old rows too: identity misses re-walk.
    inst.setItems(items);
    inst.sync();
    const afterFresh = vi.mocked(layout).mock.calls.length;
    expect(afterFresh).toBeGreaterThan(before); // fresh identities re-measured
    // Now append with PRESERVED identities: only the new row walks.
    const grown = [...items, { id: '51' }];
    inst.setItems(grown);
    inst.sync();
    const afterAppend = vi.mocked(layout).mock.calls.length;
    expect(afterAppend - afterFresh).toBe(1);
    expect(inst.totalHeight()).toBe(52 * 20);
  });

  it('consults the persistent height cache for never-seen rows and writes fresh walks', () => {
    const store = new Map<string, number>();
    const get = vi.fn((key: string) => store.get(key));
    const set = vi.fn((key: string, _w: number, h: number) => void store.set(key, h));
    store.set('0', 20); // pre-seeded: row 0 must not walk
    const inst = new MugenInstance<{ id: string }>();
    inst.heightCache = { get: (k) => get(k), set: (k, w, h) => set(k, w, h) };
    inst.setItems([{ id: '0' }, { id: '1' }]);
    inst.configure({
      getKey: (it) => it.id,
      render: () => <Text font="16px Inter">row</Text>,
      defaults: { font: '16px Inter', lineHeight: 20 },
    });
    inst.setViewport(300, 100, 16);
    inst.sync();
    expect(inst.totalHeight()).toBe(40);
    expect(get).toHaveBeenCalledWith('0');
    expect(store.get('1')).toBe(20); // fresh walk written back
  });

  it('scrollToBottom drives the scroll element to the bottom', () => {
    const inst = makeInstance(10);
    const calls: Array<{ top: number; behavior?: string }> = [];
    const el = {
      scrollHeight: 1000,
      clientHeight: 100,
      scrollTo: (o: { top: number; behavior?: string }) => calls.push(o),
    } as unknown as HTMLElement;
    inst.attachScroller(el);
    inst.scrollToBottom({ behavior: 'smooth' });
    expect(calls).toEqual([{ top: 1000, behavior: 'smooth' }]);
  });
});
