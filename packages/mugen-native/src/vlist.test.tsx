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
import { MugenVList, useMugenVirtualizer, Text, VStack, HStack, Escape } from './index';

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

const findRows = (r: ReactTestRenderer): ReactTestInstance[] =>
  r.root
    .findAllByType('rn-view' as never)
    .filter((n) => (n.props as { style?: { position?: string } }).style?.position === 'absolute');

const rowTop = (n: ReactTestInstance): number =>
  (n.props as { style: { top: number } }).style.top;

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
  return flat.height;
};

const lineTexts = (n: ReactTestInstance): string[] =>
  n.findAllByType('rn-text' as never).map((t) => String((t.props as { children: unknown }).children));

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

    // The painted lines are pretext's materialized breaks, one <Text> each.
    expect(lineTexts(rows[0]!)).toEqual(['AAAA ', 'AAAA ', 'AAAA']);
    expect(lineTexts(rows[1]!)).toEqual(['AA']);
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

  test('windows rows: only the visible slice renders, scrolling moves it', () => {
    const items = Array.from({ length: 100 }, (_, i) => ({ id: String(i), text: 'AA' }));
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<App items={items} />);
    });
    // 100 rows × 110px; viewport 600 → rows 0..5 visible (offset 550 ≤ 600).
    let rows = findRows(r);
    expect(rows.length).toBe(6);
    expect(rowTop(rows[0]!)).toBe(0);

    // Scroll to 2200 (row 20): window follows.
    const scroll = r.root.findByType('rn-scrollview' as never);
    act(() => {
      (scroll.props as { onScroll: (e: unknown) => void }).onScroll({
        nativeEvent: { contentOffset: { y: 2200 } },
      });
    });
    rows = findRows(r);
    expect(rowTop(rows[0]!)).toBe(2200);
    expect(rows.length).toBe(6);
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
      y: 10400,
    });
    const rows = findRows(r);
    // Window at the anchor: first visible row starts at ⌊10400/110⌋ × 110.
    expect(rowTop(rows[0]!)).toBe(10340);
    expect(rowTop(rows[rows.length - 1]!)).toBe(10890);
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
