import { act, cleanup, render } from '@testing-library/react';
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

import { MugenVList, useMugenVirtualizer } from './vlist';
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

const spacerOf = (container: HTMLElement) =>
  (container.firstChild as HTMLElement).firstChild as HTMLElement;

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
});
