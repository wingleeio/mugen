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
