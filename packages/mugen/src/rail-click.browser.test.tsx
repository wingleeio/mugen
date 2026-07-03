import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useState } from 'react';
import { MugenVList, useMugenVirtualizer } from './vlist';
import { VStack } from './primitives/box';
import { Text } from './primitives/text';
import type { MugenInstance } from './instance';

// Reproduces the comet message-rail bug: after a streamed reply (stick-to-bottom
// spring engaged), a programmatic smooth scrollToItem appears to do nothing.

interface Item {
  id: string;
  body: string;
}

const FONT = '16px Arial';
const LH = 22;
const HEIGHT = 400;

const makeItems = (n: number): Item[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `m${i}`,
    body: `row ${i} ` + 'lorem ipsum dolor sit amet '.repeat(4),
  }));

type Handle = {
  instance: MugenInstance<Item>;
  setItems: (items: Item[]) => void;
};

function Harness(props: { initial: Item[]; handleRef: { current: Handle | null } }) {
  const [items, setItems] = useState(props.initial);
  const instance = useMugenVirtualizer({ items });
  props.handleRef.current = { instance, setItems };
  return (
    <MugenVList
      instance={instance}
      getKey={(it) => it.id}
      render={(it) => (
        <VStack padding={8}>
          <Text>{it.body}</Text>
        </VStack>
      )}
      font={FONT}
      lineHeight={LH}
      height={HEIGHT}
      stickToBottom
      initialScroll="bottom"
      overscan={320}
      renderTop={() => <VStack height={16} />}
      renderBottom={() => <VStack height={56} />}
    />
  );
}

const scrollerOf = (container: HTMLElement): HTMLElement => container.firstChild as HTMLElement;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Poll until `fn` is true or `ms` elapsed; returns whether it became true. */
async function eventually(fn: () => boolean, ms: number): Promise<boolean> {
  const start = performance.now();
  while (performance.now() - start < ms) {
    if (fn()) return true;
    await sleep(40);
  }
  return fn();
}

afterEach(() => cleanup());

describe('smooth scrollToItem (message-rail click)', () => {
  it('works on a fresh mount (baseline)', async () => {
    const handleRef: { current: Handle | null } = { current: null };
    const { container } = render(<Harness initial={makeItems(30)} handleRef={handleRef} />);
    const el = scrollerOf(container);
    await sleep(100);
    const before = el.scrollTop;
    expect(before).toBeGreaterThan(0); // opened at the bottom

    const target = handleRef.current!.instance.scrollTargetForIndex(2, 'start')!;
    handleRef.current!.instance.scrollToItem('m2', { behavior: 'smooth', align: 'start' });
    const moved = await eventually(() => Math.abs(el.scrollTop - target) < 4, 2000);
    expect(moved, `scrollTop=${el.scrollTop} target=${target} before=${before}`).toBe(true);
  });

  it('works after streamed growth has settled (post-reply click)', async () => {
    const handleRef: { current: Handle | null } = { current: null };
    const { container } = render(<Harness initial={makeItems(3)} handleRef={handleRef} />);
    const el = scrollerOf(container);
    await sleep(60);

    // Stream: append one row every ~25ms until 30 rows — the stick spring engages.
    for (let n = 4; n <= 30; n++) {
      act(() => handleRef.current!.setItems(makeItems(n)));
      await sleep(25);
    }
    // Let the spring settle and park (SETTLE_GRACE_MS = 500 + decay).
    await sleep(1600);
    const bottom = el.scrollHeight - el.clientHeight;
    expect(Math.abs(el.scrollTop - bottom)).toBeLessThan(4); // pinned

    const target = handleRef.current!.instance.scrollTargetForIndex(2, 'start')!;
    handleRef.current!.instance.scrollToItem('m2', { behavior: 'smooth', align: 'start' });
    const moved = await eventually(() => Math.abs(el.scrollTop - target) < 4, 2500);
    expect(moved, `scrollTop=${el.scrollTop} target=${target} bottom=${bottom}`).toBe(true);
  });

  it('works while content is still streaming (mid-run click)', async () => {
    const handleRef: { current: Handle | null } = { current: null };
    const { container } = render(<Harness initial={makeItems(3)} handleRef={handleRef} />);
    const el = scrollerOf(container);
    await sleep(60);

    for (let n = 4; n <= 20; n++) {
      act(() => handleRef.current!.setItems(makeItems(n)));
      await sleep(25);
    }
    // Click while the reply is still streaming, then keep streaming.
    const target = handleRef.current!.instance.scrollTargetForIndex(2, 'start')!;
    handleRef.current!.instance.scrollToItem('m2', { behavior: 'smooth', align: 'start' });
    for (let n = 21; n <= 40; n++) {
      act(() => handleRef.current!.setItems(makeItems(n)));
      await sleep(25);
    }
    const moved = await eventually(() => Math.abs(el.scrollTop - target) < 4, 2500);
    expect(moved, `scrollTop=${el.scrollTop} target=${target}`).toBe(true);
  });

  it('keeps sticking to the bottom during a stream when nothing is clicked', async () => {
    const handleRef: { current: Handle | null } = { current: null };
    const { container } = render(<Harness initial={makeItems(3)} handleRef={handleRef} />);
    const el = scrollerOf(container);
    await sleep(60);

    for (let n = 4; n <= 30; n++) {
      act(() => handleRef.current!.setItems(makeItems(n)));
      await sleep(25);
    }
    const pinned = await eventually(
      () => el.scrollHeight - el.clientHeight - el.scrollTop < 4,
      2000,
    );
    expect(pinned, `dist=${el.scrollHeight - el.clientHeight - el.scrollTop}`).toBe(true);
  });

  it('clicking the bottom-most row while pinned does not break the stick', async () => {
    const handleRef: { current: Handle | null } = { current: null };
    const { container } = render(<Harness initial={makeItems(3)} handleRef={handleRef} />);
    const el = scrollerOf(container);
    await sleep(60);

    for (let n = 4; n <= 20; n++) {
      act(() => handleRef.current!.setItems(makeItems(n)));
      await sleep(25);
    }
    // The rail's last tick: a same-position/downward target must keep the stick.
    handleRef.current!.instance.scrollToItem('m19', { behavior: 'smooth', align: 'start' });
    await sleep(100);
    // Growth after the click must still pin to the bottom.
    for (let n = 21; n <= 35; n++) {
      act(() => handleRef.current!.setItems(makeItems(n)));
      await sleep(25);
    }
    const pinned = await eventually(
      () => el.scrollHeight - el.clientHeight - el.scrollTop < 4,
      2000,
    );
    expect(pinned, `dist=${el.scrollHeight - el.clientHeight - el.scrollTop}`).toBe(true);
  });

  it('scrollToBottom after an upward click re-engages the stick', async () => {
    const handleRef: { current: Handle | null } = { current: null };
    const { container } = render(<Harness initial={makeItems(3)} handleRef={handleRef} />);
    const el = scrollerOf(container);
    await sleep(60);

    for (let n = 4; n <= 20; n++) {
      act(() => handleRef.current!.setItems(makeItems(n)));
      await sleep(25);
    }
    // Click up (escapes the stick), then jump back down.
    const target = handleRef.current!.instance.scrollTargetForIndex(2, 'start')!;
    handleRef.current!.instance.scrollToItem('m2', { behavior: 'smooth', align: 'start' });
    await eventually(() => Math.abs(el.scrollTop - target) < 4, 2500);
    handleRef.current!.instance.scrollToBottom();
    await sleep(60);
    // Growth must pin again after returning to the bottom.
    for (let n = 21; n <= 35; n++) {
      act(() => handleRef.current!.setItems(makeItems(n)));
      await sleep(25);
    }
    const pinned = await eventually(
      () => el.scrollHeight - el.clientHeight - el.scrollTop < 4,
      2000,
    );
    expect(pinned, `dist=${el.scrollHeight - el.clientHeight - el.scrollTop}`).toBe(true);
  });

  it('works immediately after growth stops (warm-spring click)', async () => {
    const handleRef: { current: Handle | null } = { current: null };
    const { container } = render(<Harness initial={makeItems(3)} handleRef={handleRef} />);
    const el = scrollerOf(container);
    await sleep(60);

    for (let n = 4; n <= 30; n++) {
      act(() => handleRef.current!.setItems(makeItems(n)));
      await sleep(25);
    }
    // No settle wait: click while the spring loop is still warm.
    const target = handleRef.current!.instance.scrollTargetForIndex(2, 'start')!;
    handleRef.current!.instance.scrollToItem('m2', { behavior: 'smooth', align: 'start' });
    const moved = await eventually(() => Math.abs(el.scrollTop - target) < 4, 2500);
    expect(moved, `scrollTop=${el.scrollTop} target=${target}`).toBe(true);
  });
});
