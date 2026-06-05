/**
 * A Fenwick tree (binary indexed tree) over per-row heights. Gives O(log n)
 * point updates and O(log n) scroll-position lookup, which is what makes a
 * row's height change (e.g. an accordion toggle) cheap even in a 100k-row list.
 *
 * - `offsetOf(i)`   → top y of row i (prefix sum of heights before i)
 * - `total()`       → sum of all heights (the scrollbar content height)
 * - `setHeight`     → point update
 * - `indexAt(y)`    → the row whose vertical range contains y (binary lifting)
 */
export class OffsetIndex {
  private n: number;
  private heights: Float64Array;
  /** 1-indexed Fenwick tree of cumulative sums. */
  private tree: Float64Array;
  /** Largest power of two ≤ n, for binary-lifting search. */
  private pow: number;

  constructor(heights: ArrayLike<number> = []) {
    this.n = heights.length;
    this.heights = new Float64Array(this.n);
    this.tree = new Float64Array(this.n + 1);
    for (let i = 0; i < this.n; i++) this.heights[i] = heights[i] ?? 0;
    this.build();
    this.pow = 1;
    while (this.pow << 1 <= this.n) this.pow <<= 1;
  }

  /** O(n) bulk construction of the tree from `heights`. */
  private build(): void {
    const { tree, heights, n } = this;
    tree.fill(0);
    for (let i = 1; i <= n; i++) {
      tree[i] = tree[i]! + heights[i - 1]!;
      const parent = i + (i & -i);
      if (parent <= n) tree[parent] = tree[parent]! + tree[i]!;
    }
  }

  get size(): number {
    return this.n;
  }

  /** Height of row `i`. */
  heightAt(i: number): number {
    return this.heights[i] ?? 0;
  }

  /** Sum of heights of rows `[0, count)` — i.e. the top offset of row `count`. */
  prefixSum(count: number): number {
    let c = Math.max(0, Math.min(count, this.n));
    let sum = 0;
    while (c > 0) {
      sum += this.tree[c]!;
      c -= c & -c;
    }
    return sum;
  }

  /** Top y of row `i` (alias for `prefixSum(i)`). */
  offsetOf(i: number): number {
    return this.prefixSum(i);
  }

  /** Total content height. */
  total(): number {
    return this.prefixSum(this.n);
  }

  /** Set row `i` to `height` via an O(log n) delta update. Returns the delta. */
  setHeight(i: number, height: number): number {
    if (i < 0 || i >= this.n) return 0;
    const delta = height - this.heights[i]!;
    if (delta === 0) return 0;
    this.heights[i] = height;
    for (let j = i + 1; j <= this.n; j += j & -j) this.tree[j]! += delta;
    return delta;
  }

  /**
   * The index of the row whose vertical range contains `y`, i.e. the largest
   * `r` with `prefixSum(r) <= y`. Clamped to `[0, n-1]`; returns 0 for an empty
   * index. Runs in O(log n) via binary lifting over the Fenwick tree.
   */
  indexAt(y: number): number {
    if (this.n === 0) return 0;
    if (y <= 0) return 0;
    let pos = 0;
    let remaining = y;
    for (let pw = this.pow; pw > 0; pw >>= 1) {
      const next = pos + pw;
      if (next <= this.n && this.tree[next]! <= remaining) {
        pos = next;
        remaining -= this.tree[pos]!;
      }
    }
    // `pos` = number of whole rows that fit before `y` = index of the row at `y`.
    return Math.min(pos, this.n - 1);
  }
}
