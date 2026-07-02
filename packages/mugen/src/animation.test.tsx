import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Deterministic text metrics: height = ceil(text.length * 10 / width) lines.
const CHAR_W = 10;
vi.mock('@chenglou/pretext', () => ({
  prepare: vi.fn((text: string) => ({ __text: text })),
  layout: vi.fn((prepared: { __text: string }, width: number, lineHeight: number) => {
    const lineCount = Math.max(1, Math.ceil((prepared.__text.length * CHAR_W) / Math.max(1, width)));
    return { height: lineCount * lineHeight, lineCount };
  }),
  clearCache: vi.fn(),
}));

import { MugenVList, useMugenVirtualizer } from './vlist';
import { useMugenMemo, useMugenRow, useMugenState, useMugenTween } from './hooks';
import { Collapse } from './primitives/collapse';
import { Text } from './primitives/text';
import { VStack } from './primitives/box';
import type { MugenInstance } from './instance';
import type { ReactNode } from 'react';

interface Item {
  id: number;
  body: string;
}

const LH = 20;
const WIDTH = 600;
const HEIGHT = 400;
// 'x'.repeat(100) at width 600 → ceil(1000 / 600) = 2 lines → 40px.
const BODY = 'x'.repeat(100);
const BODY_H = 2 * LH;

type InstanceRef = { current: MugenInstance<Item> | null };

function Harness(props: {
  items: Item[];
  render: (item: Item) => ReactNode;
  instanceRef?: InstanceRef;
}) {
  const instance = useMugenVirtualizer({ items: props.items });
  if (props.instanceRef) props.instanceRef.current = instance;
  return (
    <MugenVList
      instance={instance}
      getKey={(it) => String(it.id)}
      render={props.render}
      font="16px Inter"
      lineHeight={LH}
      width={WIDTH}
      height={HEIGHT}
    />
  );
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'performance',
    ],
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Advance fake time in ~frame-sized steps inside act (flushes React work). */
function frames(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('Collapse', () => {
  function CollapseRow(item: Item): ReactNode {
    const [open, setOpen] = useMugenState(false);
    return (
      <VStack>
        <VStack onClick={() => setOpen((o) => !o)} data-testid={`head-${item.id}`}>
          <Text>head</Text>
        </VStack>
        <Collapse id="body" open={open} duration={200} easing="linear">
          <Text>{item.body}</Text>
        </Collapse>
      </VStack>
    );
  }

  it('tweens the committed height, keeping painted and computed layout equal every frame', () => {
    const ref: InstanceRef = { current: null };
    const items = [
      { id: 0, body: BODY },
      { id: 1, body: BODY },
      { id: 2, body: BODY },
    ];
    const { container, getByTestId } = render(
      <Harness items={items} render={CollapseRow} instanceRef={ref} />,
    );
    const inst = ref.current!;
    const closedTotal = 3 * LH;
    expect(inst.totalHeight()).toBe(closedTotal);

    fireEvent.click(getByTestId('head-0'));
    // The toggle re-measures immediately with the tween still at 0 — the
    // height starts moving on the first frame, not synchronously.
    expect(inst.totalHeight()).toBe(closedTotal);
    expect(inst.activeTweenCount()).toBe(1);

    // Halfway through a linear 200ms tween → half the body height.
    frames(100);
    const midTotal = inst.totalHeight();
    expect(midTotal).toBeGreaterThan(closedTotal);
    expect(midTotal).toBeLessThan(closedTotal + BODY_H);
    // Painted box === committed height, mid-flight.
    const box = container.querySelector('[data-mugen-collapse="body"]') as HTMLElement;
    expect(parseFloat(box.style.height)).toBeCloseTo(midTotal - closedTotal, 3);

    frames(200);
    // Settled totals carry ~1e-14 of Fenwick prefix-sum dust from the
    // fractional per-frame deltas — the committed heights themselves are exact.
    expect(inst.totalHeight()).toBeCloseTo(closedTotal + BODY_H, 6);
    expect(inst.activeTweenCount()).toBe(0);
    expect(parseFloat(box.style.height)).toBeCloseTo(BODY_H, 6);

    // And back down: retarget from the settled-open height.
    fireEvent.click(getByTestId('head-0'));
    frames(100);
    const midClose = inst.totalHeight();
    expect(midClose).toBeGreaterThan(closedTotal);
    expect(midClose).toBeLessThan(closedTotal + BODY_H);
    frames(200);
    expect(inst.totalHeight()).toBeCloseTo(closedTotal, 6);
  });

  it('re-aims mid-flight when toggled back before settling', () => {
    const ref: InstanceRef = { current: null };
    const { getByTestId } = render(
      <Harness items={[{ id: 0, body: BODY }]} render={CollapseRow} instanceRef={ref} />,
    );
    const inst = ref.current!;
    fireEvent.click(getByTestId('head-0'));
    frames(100); // partway open
    const midOpen = inst.totalHeight() - LH;
    expect(midOpen).toBeGreaterThan(0);
    expect(midOpen).toBeLessThan(BODY_H);
    fireEvent.click(getByTestId('head-0')); // close, re-aiming from mid-flight
    frames(100); // partway back down — below where the reversal started
    const midClose = inst.totalHeight() - LH;
    expect(midClose).toBeGreaterThan(0);
    expect(midClose).toBeLessThan(midOpen);
    frames(200);
    expect(inst.totalHeight()).toBeCloseTo(LH, 6);
    expect(inst.activeTweenCount()).toBe(0);
  });

  it('snaps (no tween) when content grows while settled open', () => {
    const ref: InstanceRef = { current: null };
    const items = [{ id: 0, body: BODY }];
    const { getByTestId, rerender } = render(
      <Harness items={items} render={CollapseRow} instanceRef={ref} />,
    );
    const inst = ref.current!;
    fireEvent.click(getByTestId('head-0'));
    frames(400); // settle open
    expect(inst.totalHeight()).toBe(LH + BODY_H);

    // Same key, twice the text: 4 lines instead of 2. New array → re-measure.
    rerender(
      <Harness items={[{ id: 0, body: BODY + BODY }]} render={CollapseRow} instanceRef={ref} />,
    );
    expect(inst.totalHeight()).toBe(LH + 2 * BODY_H);
    expect(inst.activeTweenCount()).toBe(0);
  });
});

describe('useMugenTween', () => {
  it('animates any declared dimension at the row root', () => {
    const ref: InstanceRef = { current: null };
    function TweenRow(item: Item): ReactNode {
      const [big, setBig] = useMugenState(false);
      const h = useMugenTween(big ? 100 : 20, { duration: 100, easing: 'linear' });
      return (
        <VStack height={h} onClick={() => setBig((b) => !b)} data-testid={`row-${item.id}`}>
          <Text>row</Text>
        </VStack>
      );
    }
    const { getByTestId } = render(
      <Harness items={[{ id: 0, body: '' }]} render={TweenRow} instanceRef={ref} />,
    );
    const inst = ref.current!;
    expect(inst.totalHeight()).toBe(20);
    fireEvent.click(getByTestId('row-0'));
    frames(50);
    const mid = inst.totalHeight();
    expect(mid).toBeGreaterThan(20);
    expect(mid).toBeLessThan(100);
    frames(100);
    expect(inst.totalHeight()).toBeCloseTo(100, 6);
  });
});

describe('useMugenRow (scoped hooks in nested components)', () => {
  function Expander({ body, testid }: { body: string; testid: string }): ReactNode {
    const row = useMugenRow('expander');
    const [open, setOpen] = row.state(false);
    return (
      <VStack onClick={() => setOpen((o) => !o)} data-testid={testid}>
        <Text>head</Text>
        {open ? <Text>{body}</Text> : null}
      </VStack>
    );
  }

  it('drives height-exact state from a nested component', () => {
    const ref: InstanceRef = { current: null };
    const { getByTestId } = render(
      <Harness
        items={[{ id: 0, body: BODY }]}
        render={(item) => <Expander body={item.body} testid={`exp-${item.id}`} />}
        instanceRef={ref}
      />,
    );
    const inst = ref.current!;
    expect(inst.totalHeight()).toBe(LH);
    fireEvent.click(getByTestId('exp-0'));
    expect(inst.totalHeight()).toBe(LH + BODY_H);
    fireEvent.click(getByTestId('exp-0'));
    expect(inst.totalHeight()).toBe(LH);
  });

  it('stays fresh under a memo-stable ancestor element (measure and paint)', () => {
    const ref: InstanceRef = { current: null };
    const { getByTestId, container } = render(
      <Harness
        items={[{ id: 0, body: BODY }]}
        render={(item) => {
          // Deliberately frozen: deps [] keep the SAME element ref across
          // re-renders, so React bails out of the subtree and the walker's
          // height memo would serve a stale height — unless the keyed-slot
          // epoch busts it and the nested subscription repaints it.
          const frozen = useMugenMemo(
            () => <Expander body={item.body} testid={`exp-${item.id}`} />,
            [],
          );
          return frozen;
        }}
        instanceRef={ref}
      />,
    );
    const inst = ref.current!;
    expect(inst.totalHeight()).toBe(LH);
    fireEvent.click(getByTestId('exp-0'));
    expect(inst.totalHeight()).toBe(LH + BODY_H); // measure re-walked
    expect(container.textContent).toContain(BODY); // paint re-rendered
    fireEvent.click(getByTestId('exp-0'));
    expect(inst.totalHeight()).toBe(LH);
    expect(container.textContent).not.toContain(BODY);
  });

  it('animates from a nested component via scope.tween', () => {
    const ref: InstanceRef = { current: null };
    function Grower({ testid }: { testid: string }): ReactNode {
      const row = useMugenRow('grower');
      const [big, setBig] = row.state(false);
      const h = row.tween(big ? 80 : 20, { duration: 100, easing: 'linear' });
      return (
        <VStack height={h} onClick={() => setBig((b) => !b)} data-testid={testid}>
          <Text>g</Text>
        </VStack>
      );
    }
    const { getByTestId } = render(
      <Harness
        items={[{ id: 0, body: '' }]}
        render={() => <Grower testid="grow" />}
        instanceRef={ref}
      />,
    );
    const inst = ref.current!;
    expect(inst.totalHeight()).toBe(20);
    fireEvent.click(getByTestId('grow'));
    frames(50);
    const mid = inst.totalHeight();
    expect(mid).toBeGreaterThan(20);
    expect(mid).toBeLessThan(80);
    frames(100);
    expect(inst.totalHeight()).toBeCloseTo(80, 6);
  });

  it('rejects positional hooks in nested components with a pointer at useMugenRow', () => {
    function Bad(): ReactNode {
      const [open] = useMugenState(false);
      return <Text>{String(open)}</Text>;
    }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      render(<Harness items={[{ id: 0, body: '' }]} render={() => <Bad />} />),
    ).toThrow(/useMugenRow/);
    spy.mockRestore();
  });
});
