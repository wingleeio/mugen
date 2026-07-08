/**
 * Behavioral tests for the native renderer, in plain Node — no DOM, no device.
 *
 * Text metrics come from a hermetic font (built binary tables, registered with
 * pretext-native), so every height below is computed the way a real RN app
 * would compute it: pure arithmetic over glyph advances. `react-native` is
 * aliased to a host-component stub; layout and scroll arrive by invoking the
 * `onLayout`/`onScroll` props, exactly like the platform would.
 */
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { create, act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { installPretextPolyfills, registerFont } from '@wingleeio/pretext-native';
import { buildTestFont } from '@wingleeio/pretext-native/testing';
import { clearTextCache, clearHeightCache, notifyFontsChanged } from '@wingleeio/mugen/native-core';
import { MugenVList, useMugenVirtualizer, Text, VStack, HStack, Escape, Collapse, useMugenRow } from './index';
import { CANVAS_HEADROOM } from './vlist';
import * as React from 'react';

// The animation clock (Collapse tweens) drives itself on rAF, absent in Node.
const g = globalThis as unknown as {
  requestAnimationFrame?: (cb: (t: number) => void) => number;
  cancelAnimationFrame?: (h: number) => void;
};
if (g.requestAnimationFrame === undefined) {
  g.requestAnimationFrame = (cb) => setTimeout(() => cb(16), 0) as unknown as number;
  g.cancelAnimationFrame = (h) => clearTimeout(h as unknown as ReturnType<typeof setTimeout>);
}

// Test font: unitsPerEm 1000, 'A'-'Z' plus a few — advances set so that at
// `100px Test` an 'A' is exactly 60px wide and a space 25px.
beforeAll(() => {
  installPretextPolyfills();
  registerFont({
    family: 'Test',
    data: buildTestFont({
      unitsPerEm: 1000,
      glyphs: [
        { char: 'A', advance: 600 },
        { char: 'B', advance: 550 },
        { char: 'V', advance: 650 },
        { char: ' ', advance: 250 },
      ],
    }),
  });
  notifyFontsChanged();
});

beforeEach(() => {
  clearTextCache();
  clearHeightCache();
});

interface Msg {
  id: string;
  text: string;
}

function App(props: {
  items: Msg[];
  overscan?: number;
  padding?: number;
  renderRow?: (m: Msg) => React.ReactNode;
}) {
  const instance = useMugenVirtualizer({ items: props.items });
  return (
    <MugenVList
      instance={instance}
      getKey={(m) => m.id}
      width={400}
      height={600}
      overscan={props.overscan ?? 0}
      font="100px Test"
      lineHeight={110}
      render={
        props.renderRow ??
        ((m) => (
          <VStack padding={props.padding ?? 0}>
            <Text>{m.text}</Text>
          </VStack>
        ))
      }
    />
  );
}

// Rows are absolutely positioned; the slot pool assigns them nearest-to-
// viewport-first, so TREE order is not visual order — sort by top.
const findRows = (r: ReactTestRenderer): ReactTestInstance[] =>
  r.root
    .findAllByType('rn-view' as never)
    .filter((n) => (n.props as { style?: { position?: string } }).style?.position === 'absolute')
    .sort(
      (a, b) =>
        (a.props as { style: { top: number } }).style.top -
        (b.props as { style: { top: number } }).style.top,
    );

// Row/canvas coordinates are biased by the iOS headroom origin — normalize.
const rowTop = (n: ReactTestInstance): number =>
  (n.props as { style: { top: number } }).style.top - CANVAS_HEADROOM;

const contentView = (r: ReactTestRenderer): ReactTestInstance => {
  const scroll = r.root.findByType('rn-scrollview' as never);
  // The single child of the ScrollView is the total-height spacer.
  return scroll.findAllByType('rn-view' as never)[0]!;
};

/** The spacer's height — its style is an array (conditional transform entry). */
const contentHeight = (r: ReactTestRenderer): number => {
  const style = (contentView(r).props as { style: unknown }).style;
  const flat = Object.assign({}, ...(Array.isArray(style) ? style : [style]).filter(Boolean)) as {
    height: number;
  };
  return flat.height - CANVAS_HEADROOM;
};

// A block renders as one <Text> whose lines are joined by '\n' (one Fabric
// node per block, not per line — primitives/text.tsx). Split back into the
// materialized lines the assertions reason about.
const lineTexts = (n: ReactTestInstance): string[] =>
  n
    .findAllByType('rn-text' as never)
    .flatMap((t) => String((t.props as { children: unknown }).children).split('\n'));

const blockNumberOfLines = (n: ReactTestInstance): number[] =>
  n
    .findAllByType('rn-text' as never)
    .map((t) => (t.props as { numberOfLines?: number }).numberOfLines ?? -1);

describe('nested useMugenRow hook stability (ToolGroup repro)', () => {
  // Mirrors comet's ToolGroup/ToolChipRow: a nested component uses useMugenRow
  // then renders a conditional, animated Collapse; the group grows as a stream
  // arrives. Reproduces "Rendered fewer hooks than expected" if useMugenRow's
  // ambient/nested branch ever flips for a fiber.
  function Chip({ id, hasOutput }: { id: string; hasOutput: boolean }) {
    const row = useMugenRow(`chip-${id}`);
    const [open, setOpen] = row.state(false);
    void setOpen;
    return (
      <VStack>
        <Text>{`chip ${id}`}</Text>
        {hasOutput ? (
          <Collapse id={`out-${id}`} open={open}>
            <Text>{`output for ${id}`}</Text>
          </Collapse>
        ) : null}
      </VStack>
    );
  }
  function Group({ ids, streaming }: { ids: string[]; streaming: boolean }) {
    const row = useMugenRow(`group`);
    const [pinned] = row.state<boolean | null>(null);
    const open = pinned ?? streaming;
    return (
      <Collapse id="group" open={open}>
        <VStack>
          {ids.map((id, i) => (
            <Chip key={id} id={id} hasOutput={!streaming || i < ids.length - 1} />
          ))}
        </VStack>
      </Collapse>
    );
  }

  function ToolApp(props: { ids: string[]; streaming: boolean }) {
    const items = [{ id: 'g', ids: props.ids, streaming: props.streaming }];
    const instance = useMugenVirtualizer({ items });
    return (
      <MugenVList
        instance={instance}
        getKey={(m) => m.id}
        width={400}
        height={600}
        overscan={0}
        stickToBottom
        font="100px Test"
        lineHeight={110}
        render={(m) => <Group ids={m.ids} streaming={m.streaming} />}
      />
    );
  }

  test('a streaming tool group that grows does not flip useMugenRow hooks', () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<ToolApp ids={['a']} streaming />);
    });
    // Stream more tool calls in, each re-render growing the group and toggling
    // the last chip's output on/off (running → done).
    for (let n = 2; n <= 6; n++) {
      const ids = Array.from({ length: n }, (_, i) => String.fromCharCode(97 + i));
      act(() => {
        r.update(<ToolApp ids={ids} streaming />);
      });
    }
    // Settle (streaming → false): open state and hasOutput both change.
    act(() => {
      r.update(<ToolApp ids={['a', 'b', 'c', 'd', 'e', 'f']} streaming={false} />);
    });
    // Reaching here without a thrown "fewer hooks" is the assertion.
    expect(r.root.findAllByType('rn-text' as never).length).toBeGreaterThan(0);
  });
});

describe('MugenVList (native)', () => {
  test('computes exact analytic heights and paints pretext lines', () => {
    // 'AAAA AAAA AAAA' at 100px in a 400px row: each 'AAAA' is 2400/10 = 240px…
    // actually 4 × 60 = 240px, space 25px. 'AAAA AAAA' = 240+25+240 = 505 > 400,
    // so each 'AAAA' wraps to its own line: 3 lines × 110 = 330px per row.
    const items = [
      { id: '1', text: 'AAAA AAAA AAAA' },
      { id: '2', text: 'AA' },
    ];
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<App items={items} />);
    });

    const total = contentHeight(r);
    // Row 1: 3 lines × 110 = 330. Row 2: 1 line × 110 = 110. Total 440.
    expect(total).toBe(440);

    const rows = findRows(r);
    expect(rows.length).toBe(2);
    expect(rowTop(rows[0]!)).toBe(0);
    expect(rowTop(rows[1]!)).toBe(330);

    // One <Text> per block, broken at pretext's points by '\n'; numberOfLines
    // caps at the measured line count so height can't grow.
    expect(lineTexts(rows[0]!)).toEqual(['AAAA ', 'AAAA ', 'AAAA']);
    expect(blockNumberOfLines(rows[0]!)).toEqual([3]);
    expect(lineTexts(rows[1]!)).toEqual(['AA']);
    expect(blockNumberOfLines(rows[1]!)).toEqual([1]);
  });

  test('padding is chrome in the height, and narrows the text width', () => {
    // padding 50 → inner 300: 'AAAA A' = 240+25+60 = 325 > 300 → 2 lines.
    const items = [{ id: '1', text: 'AAAA A' }];
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<App items={items} padding={50} />);
    });
    const total = contentHeight(r);
    expect(total).toBe(2 * 110 + 100);
  });

  test('windows rows on open; scrolling rebinds the pool to the destination', () => {
    const items = Array.from({ length: 100 }, (_, i) => ({ id: String(i), text: 'AA' }));
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<App items={items} />);
    });
    // 100 rows × 110px; viewport 600 → rows 0..5 visible (offset 550 ≤ 600),
    // plus the always-bound top block reaching vh/2 below the viewport (the
    // open IS at the top here): rows 0..8.
    let rows = findRows(r);
    expect(rows.length).toBe(9);
    expect(rowTop(rows[0]!)).toBe(0);

    // Scroll to 2200 (row 20): fresh rebinds are budgeted per event, so run a
    // few events like the platform would; the destination slice binds fully
    // and the pool stays BOUNDED (rows that left the window are recycled —
    // that bound is what keeps unmount/navigation instant).
    const scroll = r.root.findByType('rn-scrollview' as never);
    for (let n = 0; n < 4; n++) {
      act(() => {
        (scroll.props as { onScroll: (e: unknown) => void }).onScroll({
          nativeEvent: { contentOffset: { y: CANVAS_HEADROOM + 2200 } },
        });
      });
    }
    rows = findRows(r);
    const tops = rows.map(rowTop);
    for (const t of [2200, 2310, 2420, 2530, 2640, 2750]) expect(tops).toContain(t);
    // Pool bounded: mounted rows ≈ window * headroom, nowhere near all 100.
    expect(rows.length).toBeLessThan(30);
  });

  test('the live-velocity projection binds the momentum landing zone ahead', async () => {
    const items = Array.from({ length: 100 }, (_, i) => ({ id: String(i), text: 'AA' }));
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<App items={items} />);
    });
    const scroll = r.root.findByType('rn-scrollview' as never);
    const fire = (y: number): void => {
      act(() => {
        (scroll.props as { onScroll: (e: unknown) => void }).onScroll({
          nativeEvent: { contentOffset: { y: CANVAS_HEADROOM + y } },
        });
      });
    };
    // Build measured velocity: two events ~15ms apart moving 90px →
    // ~6000px/s → projected travel ≈ 6·0.998/0.002 ≈ 2994px past the offset.
    fire(0);
    await new Promise((res) => setTimeout(res, 15));
    fire(90);
    const tops = findRows(r).map(rowTop);
    // Rows near the projected landing (~90+smoothed-travel; smoothing halves
    // the first estimate, so expect binding well beyond the plain window).
    expect(Math.max(...tops)).toBeGreaterThan(1200);
  });

  test('HStack distributes width; fixed children keep theirs', () => {
    // Escape fixed at 100px + text: text gets 300px → 'AAAA A' (325px) wraps to 2 lines.
    const items = [{ id: '1', text: 'AAAA A' }];
    let r!: ReactTestRenderer;
    act(() => {
      r = create(
        <App
          items={items}
          renderRow={(m) => (
            <HStack>
              <Escape height={40} width={100} />
              <Text>{m.text}</Text>
            </HStack>
          )}
        />,
      );
    });
    // Row height = max(40, 2 × 110) = 220.
    const total = contentHeight(r);
    expect(total).toBe(220);
    // And the painted text broke at the distributed width, not the row width.
    const rows = findRows(r);
    expect(lineTexts(rows[0]!)).toEqual(['AAAA ', 'A']);
  });

  test('escape reserves exactly its declared box', () => {
    const items = [{ id: '1', text: 'unused' }];
    let r!: ReactTestRenderer;
    act(() => {
      r = create(
        <App items={items} renderRow={() => <Escape height={123}>{null}</Escape>} />,
      );
    });
    const total = contentHeight(r);
    expect(total).toBe(123);
  });

  test('initialScroll bottom seeds the mount frame: contentOffset + window at anchor', () => {
    // 100 rows × 110 = 11000; viewport 600 → anchor at 10400. With controlled
    // dims the FIRST committed frame must already be at the bottom: offset via
    // the ScrollView's mount-time contentOffset prop (an imperative scrollTo
    // races native content layout and strands the viewport past the content),
    // and the row window computed at the anchor, not the top.
    const items = Array.from({ length: 100 }, (_, i) => ({ id: String(i), text: 'AA' }));
    function BottomApp() {
      const instance = useMugenVirtualizer({ items });
      return (
        <MugenVList
          instance={instance}
          getKey={(m) => m.id}
          width={400}
          height={600}
          overscan={0}
          font="100px Test"
          lineHeight={110}
          initialScroll="bottom"
          render={(m) => (
            <VStack>
              <Text>{m.text}</Text>
            </VStack>
          )}
        />
      );
    }
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<BottomApp />);
    });
    const scroll = r.root.findByType('rn-scrollview' as never);
    expect((scroll.props as { contentOffset?: { y: number } }).contentOffset).toEqual({
      x: 0,
      y: CANVAS_HEADROOM + 10400,
    });
    const rows = findRows(r);
    const tops = rows.map(rowTop);
    // Window at the anchor: first visible row starts at ⌊10400/110⌋ × 110.
    for (const t of [10340, 10450, 10560, 10670, 10780, 10890]) expect(tops).toContain(t);
    expect(rowTop(rows[rows.length - 1]!)).toBe(10890);
    // The transcript top is always bound (scroll-to-top landing zone).
    expect(tops).toContain(0);
  });

  test('resident mode (overscan Infinity): all rows mounted, scroll is free', () => {
    const items = Array.from({ length: 100 }, (_, i) => ({ id: String(i), text: 'AA' }));
    function ResidentApp() {
      const instance = useMugenVirtualizer({ items });
      return (
        <MugenVList
          instance={instance}
          getKey={(m) => m.id}
          width={400}
          height={600}
          overscan={Infinity}
          font="100px Test"
          lineHeight={110}
          render={(m) => (
            <VStack>
              <Text>{m.text}</Text>
            </VStack>
          )}
        />
      );
    }
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<ResidentApp />);
    });
    expect(findRows(r).length).toBe(100);
    // Scrolling re-windows nothing — every row is already there.
    const scroll = r.root.findByType('rn-scrollview' as never);
    act(() => {
      (scroll.props as { onScroll: (e: unknown) => void }).onScroll({
        nativeEvent: { contentOffset: { y: CANVAS_HEADROOM + 5000 } },
      });
    });
    expect(findRows(r).length).toBe(100);
  });

  test('growth with items appended patches offsets', () => {
    const items = Array.from({ length: 3 }, (_, i) => ({ id: String(i), text: 'AA' }));
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<App items={items} />);
    });
    expect(contentHeight(r)).toBe(330);
    act(() => {
      r.update(<App items={[...items, { id: '3', text: 'AAAA AAAA AAAA' }]} />);
    });
    expect(contentHeight(r)).toBe(330 + 330);
  });
});
