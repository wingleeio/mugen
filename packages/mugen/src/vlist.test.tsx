import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const CHAR_W = 10;
vi.mock('@chenglou/pretext', () => ({
  prepare: vi.fn((text: string) => ({ __text: text })),
  layout: vi.fn((prepared: { __text: string }, width: number, lineHeight: number) => {
    const lineCount = Math.max(1, Math.ceil((prepared.__text.length * CHAR_W) / Math.max(1, width)));
    return { height: lineCount * lineHeight, lineCount };
  }),
  clearCache: vi.fn(),
}));

import { MugenVList, useMugenVirtualizer, type MugenVListProps } from './vlist';
import { useMugenState, useMugenEffect } from './hooks';
import { Text } from './primitives/text';
import { VStack } from './primitives/box';
import type { MugenInstance } from './instance';

interface Item {
  id: number;
  body: string;
}

const LH = 20;
const WIDTH = 600;
const HEIGHT = 400;

const makeItems = (n: number): Item[] =>
  Array.from({ length: n }, (_, i) => ({ id: i, body: 'x'.repeat(100) }));
const makeRange = (start: number, end: number): Item[] =>
  Array.from({ length: end - start + 1 }, (_, i) => ({
    id: start + i,
    body: 'x'.repeat(100),
  }));

const spacerOf = (container: HTMLElement) =>
  (container.firstChild as HTMLElement).firstChild as HTMLElement;

type InstanceRef = { current: MugenInstance<Item> | null };
type HarnessListProps = Pick<
  MugenVListProps<Item>,
  | 'renderTop'
  | 'renderBottom'
  | 'onTopReached'
  | 'onBottomReached'
  | 'topReachedThreshold'
  | 'bottomReachedThreshold'
  | 'initialScroll'
>;

function Harness(props: {
  items: Item[];
  render: (item: Item) => ReactNode;
  instanceRef?: InstanceRef;
  vlistProps?: Partial<HarnessListProps>;
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
      {...props.vlistProps}
    />
  );
}

afterEach(() => cleanup());

describe('MugenVList windowing', () => {
  it('renders only the visible slice of a 500-row list', () => {
    const { container } = render(
      <Harness
        items={makeItems(500)}
        render={(it) => (
          <VStack gap={4}>
            <Text>{`row-${it.id}`}</Text>
          </VStack>
        )}
      />,
    );

    expect(spacerOf(container).style.height).toBe('10000px'); // 500 × 20px
    const rendered = container.querySelectorAll('[data-mugen-row]');
    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered.length).toBeLessThan(80);
    expect(container.textContent).toContain('row-0');
    expect(container.textContent).not.toContain('row-499');
  });

  it('measures top and bottom slots as scrollable content', () => {
    const { container } = render(
      <Harness
        items={makeItems(3)}
        vlistProps={{
          renderTop: () => (
            <VStack height={40}>
              <Text>top</Text>
            </VStack>
          ),
          renderBottom: () => (
            <VStack height={60}>
              <Text>bottom</Text>
            </VStack>
          ),
        }}
        render={(it) => (
          <VStack>
            <Text>{`row-${it.id}`}</Text>
          </VStack>
        )}
      />,
    );

    expect(spacerOf(container).style.height).toBe(`${40 + 3 * LH + 60}px`);
    expect(container.querySelector('[data-mugen-top]')?.textContent).toContain('top');
    expect((container.querySelector('[data-mugen-row="0"]') as HTMLElement).style.top).toBe(
      '40px',
    );
    expect((container.querySelector('[data-mugen-bottom]') as HTMLElement).style.top).toBe(
      `${40 + 3 * LH}px`,
    );
  });

  it('calls reach callbacks once per threshold crossing', async () => {
    const onTopReached = vi.fn();
    const onBottomReached = vi.fn();
    const { container } = render(
      <Harness
        items={makeItems(50)}
        vlistProps={{ onTopReached, onBottomReached, bottomReachedThreshold: 40 }}
        render={(it) => (
          <VStack>
            <Text>{`row-${it.id}`}</Text>
          </VStack>
        )}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(onTopReached).toHaveBeenCalledTimes(1);
    expect(onTopReached).toHaveBeenLastCalledWith(0);
    expect(onBottomReached).not.toHaveBeenCalled();

    const scroller = container.firstChild as HTMLElement;
    await act(async () => {
      scroller.scrollTop = 560;
      fireEvent.scroll(scroller);
      await Promise.resolve();
    });

    expect(onBottomReached).toHaveBeenCalledTimes(1);
    expect(onBottomReached).toHaveBeenLastCalledWith(49);

    await act(async () => {
      fireEvent.scroll(scroller);
      await Promise.resolve();
    });
    expect(onBottomReached).toHaveBeenCalledTimes(1);

    await act(async () => {
      scroller.scrollTop = 100;
      fireEvent.scroll(scroller);
      await Promise.resolve();
    });
    await act(async () => {
      scroller.scrollTop = 560;
      fireEvent.scroll(scroller);
      await Promise.resolve();
    });
    expect(onBottomReached).toHaveBeenCalledTimes(2);
  });

  it('fires a reach callback again when the edge item changes while still at the edge', async () => {
    const onTopReached = vi.fn();
    const renderRow = (it: Item) => (
      <VStack>
        <Text>{`row-${it.id}`}</Text>
      </VStack>
    );
    const { rerender } = render(
      <Harness items={makeRange(10, 59)} vlistProps={{ onTopReached }} render={renderRow} />,
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(onTopReached).toHaveBeenCalledTimes(1);

    rerender(
      <Harness items={makeRange(60, 109)} vlistProps={{ onTopReached }} render={renderRow} />,
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(onTopReached).toHaveBeenCalledTimes(2);
  });
});

describe('useMugenState', () => {
  it('resizes the scrollbar when an off-screen row changes, without mounting it', () => {
    const setters = new Map<number, (v: boolean) => void>();
    const { container } = render(
      <Harness
        items={makeItems(500)}
        render={(it) => {
          const [expanded, setExpanded] = useMugenState(false);
          setters.set(it.id, setExpanded);
          return (
            <VStack gap={4}>
              <Text>{`row-${it.id}`}</Text>
              {expanded ? <Text>{it.body}</Text> : null}
            </VStack>
          );
        }}
      />,
    );
    expect(spacerOf(container).style.height).toBe('10000px');

    act(() => setters.get(400)!(true)); // off-screen, never mounted

    // row 400 grows by gap(4) + body(100 chars → 2 lines × 20 = 40) = +44.
    expect(spacerOf(container).style.height).toBe(`${10000 + 44}px`);
    expect(container.textContent).not.toContain('row-400');
  });

  it('a change to one row does not re-render rows above it', () => {
    const renders = new Map<number, number>();
    const setters = new Map<number, (v: boolean) => void>();
    render(
      <Harness
        items={makeItems(500)}
        render={(it) => {
          renders.set(it.id, (renders.get(it.id) ?? 0) + 1);
          const [expanded, setExpanded] = useMugenState(false);
          setters.set(it.id, setExpanded);
          return (
            <VStack gap={4}>
              <Text>{`row-${it.id}`}</Text>
              {expanded ? <Text>{it.body}</Text> : null}
            </VStack>
          );
        }}
      />,
    );

    const row0Before = renders.get(0)!;
    expect(row0Before).toBeGreaterThan(0);

    act(() => setters.get(10)!(true));

    expect(renders.get(0)).toBe(row0Before); // a row above the change: untouched
    expect(renders.get(10)!).toBeGreaterThan(1); // the changed row re-rendered
  });
});

describe('useMugenEffect', () => {
  it('runs for every row (on- and off-screen) and re-measures on setState', async () => {
    const { container } = render(
      <Harness
        items={makeItems(500)}
        render={(it) => {
          const [loaded, setLoaded] = useMugenState(false);
          useMugenEffect(() => {
            setLoaded(true);
          }, [it.id]);
          return (
            <VStack gap={4}>
              <Text>{`row-${it.id}`}</Text>
              {loaded ? <Text>{it.body}</Text> : null}
            </VStack>
          );
        }}
      />,
    );
    expect(spacerOf(container).style.height).toBe('10000px'); // before effects flush

    await act(async () => {
      await Promise.resolve();
    });

    // Every row's effect ran (even off-screen): each grew to 20 + 4 + 40 = 64.
    expect(spacerOf(container).style.height).toBe(`${500 * 64}px`);
  });
});

describe('instance.scrollToItem', () => {
  it('scrolls to a row by key at its offset', () => {
    const instanceRef: InstanceRef = { current: null };
    const { container } = render(
      <Harness
        items={makeItems(500)}
        instanceRef={instanceRef}
        render={(it) => (
          <VStack>
            <Text>{`row-${it.id}`}</Text>
          </VStack>
        )}
      />,
    );
    const scroller = container.firstChild as HTMLElement;
    const spy = vi.fn();
    scroller.scrollTo = spy as unknown as HTMLElement['scrollTo'];

    act(() => instanceRef.current!.scrollToItem('250', { align: 'start' }));

    expect(spy).toHaveBeenCalledWith({ top: 250 * LH, behavior: 'auto' });
  });

  it('includes the top slot height when scrolling to a row', () => {
    const instanceRef: InstanceRef = { current: null };
    const { container } = render(
      <Harness
        items={makeItems(10)}
        instanceRef={instanceRef}
        vlistProps={{
          renderTop: () => (
            <VStack height={40}>
              <Text>top</Text>
            </VStack>
          ),
        }}
        render={(it) => (
          <VStack>
            <Text>{`row-${it.id}`}</Text>
          </VStack>
        )}
      />,
    );
    const scroller = container.firstChild as HTMLElement;
    const spy = vi.fn();
    scroller.scrollTo = spy as unknown as HTMLElement['scrollTo'];

    act(() => instanceRef.current!.scrollToItem('5', { align: 'start' }));

    expect(spy).toHaveBeenCalledWith({ top: 40 + 5 * LH, behavior: 'auto' });
  });
});

describe('MugenVList initial and data-change scroll anchoring', () => {
  it('can start at an item index before paint', () => {
    const { container } = render(
      <Harness
        items={makeItems(50)}
        vlistProps={{ initialScroll: { to: 'index', index: 8, align: 'start' } }}
        render={(it) => (
          <VStack>
            <Text>{`row-${it.id}`}</Text>
          </VStack>
        )}
      />,
    );

    expect((container.firstChild as HTMLElement).scrollTop).toBe(8 * LH);
  });

  it('keeps the previous first visible row anchored when items are prepended', async () => {
    const renderRow = (it: Item) => (
      <VStack>
        <Text>{`row-${it.id}`}</Text>
      </VStack>
    );
    const { container, rerender } = render(
      <Harness items={makeRange(20, 69)} render={renderRow} />,
    );
    const scroller = container.firstChild as HTMLElement;
    await act(async () => {
      scroller.scrollTop = 60;
      fireEvent.scroll(scroller);
      await Promise.resolve();
    });

    rerender(<Harness items={makeRange(10, 69)} render={renderRow} />);

    expect(scroller.scrollTop).toBe(60 + 10 * LH);
  });
});
