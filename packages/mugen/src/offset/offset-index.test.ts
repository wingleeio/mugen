import { describe, expect, it } from 'vitest';
import { OffsetIndex } from './offset-index';

/** Naive cumulative reference: cum[k] = sum of heights[0..k-1]. */
function cumulative(heights: number[]): number[] {
  const cum = new Array<number>(heights.length + 1);
  cum[0] = 0;
  for (let i = 0; i < heights.length; i++) cum[i + 1] = cum[i]! + heights[i]!;
  return cum;
}

function refIndexAt(cum: number[], y: number): number {
  const n = cum.length - 1;
  if (n === 0) return 0;
  if (y <= 0) return 0;
  // largest r with cum[r] <= y
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cum[mid]! <= y) lo = mid;
    else hi = mid - 1;
  }
  return Math.min(lo, n - 1);
}

describe('OffsetIndex: basics', () => {
  it('handles an empty index', () => {
    const idx = new OffsetIndex();
    expect(idx.size).toBe(0);
    expect(idx.total()).toBe(0);
    expect(idx.indexAt(0)).toBe(0);
    expect(idx.indexAt(100)).toBe(0);
  });

  it('computes offsets, total, and boundary lookups', () => {
    const idx = new OffsetIndex([10, 20, 30, 40]);
    expect(idx.total()).toBe(100);
    expect(idx.offsetOf(0)).toBe(0);
    expect(idx.offsetOf(1)).toBe(10);
    expect(idx.offsetOf(2)).toBe(30);
    expect(idx.offsetOf(3)).toBe(60);
    expect(idx.offsetOf(4)).toBe(100);

    expect(idx.indexAt(0)).toBe(0);
    expect(idx.indexAt(9)).toBe(0);
    expect(idx.indexAt(10)).toBe(1);
    expect(idx.indexAt(29)).toBe(1);
    expect(idx.indexAt(30)).toBe(2);
    expect(idx.indexAt(59)).toBe(2);
    expect(idx.indexAt(60)).toBe(3);
    expect(idx.indexAt(99)).toBe(3);
    expect(idx.indexAt(100)).toBe(3); // clamped to last row
    expect(idx.indexAt(10_000)).toBe(3);
  });

  it('applies point updates', () => {
    const idx = new OffsetIndex([10, 20, 30]);
    const delta = idx.setHeight(1, 25);
    expect(delta).toBe(5);
    expect(idx.heightAt(1)).toBe(25);
    expect(idx.total()).toBe(65);
    expect(idx.offsetOf(2)).toBe(35);
    expect(idx.setHeight(1, 25)).toBe(0); // no-op delta
  });
});

describe('OffsetIndex: 100k correctness vs naive reference', () => {
  const N = 100_000;
  // Deterministic pseudo-random heights (no Math.random in this environment).
  const heights: number[] = [];
  let seed = 123456789;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < N; i++) heights.push(1 + Math.floor(rand() * 80));

  it('matches prefix sums and indexAt across the range', () => {
    const idx = new OffsetIndex(heights);
    const cum = cumulative(heights);
    expect(idx.total()).toBe(cum[N]);

    for (let t = 0; t < 2000; t++) {
      const k = Math.floor(rand() * (N + 1));
      expect(idx.prefixSum(k)).toBe(cum[k]);
      const y = Math.floor(rand() * cum[N]!);
      expect(idx.indexAt(y)).toBe(refIndexAt(cum, y));
    }
  });

  it('stays correct after many point updates', () => {
    const idx = new OffsetIndex(heights);
    const work = heights.slice();
    for (let t = 0; t < 5000; t++) {
      const i = Math.floor(rand() * N);
      const h = 1 + Math.floor(rand() * 200);
      idx.setHeight(i, h);
      work[i] = h;
    }
    const cum = cumulative(work);
    expect(idx.total()).toBeCloseTo(cum[N]!, 6);
    for (let t = 0; t < 2000; t++) {
      const y = Math.floor(rand() * cum[N]!);
      expect(idx.indexAt(y)).toBe(refIndexAt(cum, y));
    }
  });

  it('does 100k updates + 100k lookups quickly (sanity, not a strict bound)', () => {
    const idx = new OffsetIndex(heights);
    const start = performance.now();
    for (let i = 0; i < N; i++) idx.setHeight(i, (i % 50) + 1);
    let acc = 0;
    for (let i = 0; i < N; i++) acc += idx.indexAt((i * 37) % Math.max(1, idx.total()));
    const ms = performance.now() - start;
    expect(acc).toBeGreaterThanOrEqual(0);
    // 200k O(log n) ops should be far under a second; generous ceiling for CI.
    expect(ms).toBeLessThan(2000);
  });
});
