/**
 * Behavioral tests for native markdown, in plain Node — no DOM, no device.
 *
 * The hermetic 'Test' font gives known advances (A=600, B=550, V=650,
 * space=250 per 1000 upem), so at `100px Test` an 'A' is exactly 60px and
 * every height below is hand-computable. `react-native` is aliased to the
 * host-component stub.
 */
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { create, act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { installPretextPolyfills, registerFont } from '@wingleeio/pretext-native';
import { buildTestFont } from '@wingleeio/pretext-native/testing';
import {
  clearTextCache,
  clearHeightCache,
  notifyFontsChanged,
} from '@wingleeio/mugen/native-core';
import { clearParseCache, clearRichTextCache } from '@wingleeio/mugen-markdown/native-core';
import { CANVAS_HEADROOM, MugenVList, useMugenVirtualizer } from '@wingleeio/mugen-native';
import { Markdown, renderMarkdown, defineMarkdownComponents } from './index';
import { VStack } from '@wingleeio/mugen-native';
import type { DeepPartial, MarkdownTheme } from './theme';

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
        { char: '#', advance: 500 },
        { char: '•', advance: 400 },
        { char: '☑', advance: 400 },
        { char: '☐', advance: 400 },
        { char: '.', advance: 300 },
        { char: '1', advance: 500 },
        { char: '2', advance: 500 },
        { char: ' ', advance: 250 },
      ],
    }),
  });
  notifyFontsChanged();
});

beforeEach(() => {
  clearTextCache();
  clearHeightCache();
  clearRichTextCache();
  clearParseCache();
});

// Every height-affecting knob pinned to hand-computable values.
const THEME: DeepPartial<MarkdownTheme> = {
  fontFamily: 'Test',
  monoFamily: 'Test',
  fontSize: 100, // A = 60px, space = 25px
  lineHeight: 110,
  blockGap: 10,
  heading: {
    sizes: { 1: 200, 2: 150, 3: 120, 4: 110, 5: 100, 6: 90 },
    lineHeights: { 1: 220, 2: 170, 3: 140, 4: 120, 5: 110, 6: 100 },
  },
  code: { fontSize: 100, lineHeight: 110, padding: 10 },
  list: { gap: 5, indent: 100 },
  table: { cellPadding: 5, gap: 1 },
  rule: { thickness: 2, gap: 8 },
  blockquote: { padding: 10, gap: 5 },
};

function App(props: { source: string; fade?: boolean }) {
  const items = [{ id: 'md', source: props.source }];
  const instance = useMugenVirtualizer({ items });
  return (
    <MugenVList
      instance={instance}
      getKey={(m) => m.id}
      width={400}
      height={2000}
      overscan={0}
      font="100px Test"
      lineHeight={110}
      render={(m) => <Markdown source={m.source} theme={THEME} fade={props.fade} />}
    />
  );
}

const totalHeight = (r: ReactTestRenderer): number => {
  const scroll = r.root.findByType('rn-scrollview' as never);
  const content = scroll.findAllByType('rn-view' as never)[0]!;
  // The canvas style is an array (conditional transform entry) and its height
  // includes the iOS headroom origin — flatten and normalize.
  const style = (content.props as { style: unknown }).style;
  const flat = Object.assign({}, ...(Array.isArray(style) ? style : [style]).filter(Boolean)) as {
    height: number;
  };
  return flat.height - CANVAS_HEADROOM;
};

const textsOf = (r: ReactTestRenderer): string[] =>
  r.root
    .findAllByType('rn-text' as never)
    .map((t) => (t.props as { children: unknown }).children)
    .filter((c): c is string => typeof c === 'string');

describe('native markdown heights', () => {
  test('paragraph with inline marks wraps at pretext lines', () => {
    // 'AAAA **AAAA** AAAA' → three 240px words + 25px spaces at width 400 →
    // one word per line → 3 × 110.
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<App source={'AAAA **AAAA** AAAA'} />);
    });
    expect(totalHeight(r)).toBe(330);
    // The bold middle word is its own fragment (own font), painted once.
    expect(textsOf(r)).toContain('AAAA');
  });

  test('heading, code block, and list heights are exact', () => {
    const md = ['# AA', '', '```js', 'AAAA', 'BB', '```', '', '- AA', '- BB'].join('\n');
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<App source={md} />);
    });
    const h1 = 220; // 1 line × heading lineHeight
    const code = 2 * 110 + 2 * 10; // 2 lines + padding; header off
    const list = 2 * 110 + 5; // two 1-line items + item gap
    const gaps = 2 * 10; // blockGap between the three blocks
    expect(totalHeight(r)).toBe(h1 + code + list + gaps);
  });

  test('code block renders tokenized colored runs without changing height', () => {
    const md = '```js\nconst A = 1\n```';
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<App source={md} />);
    });
    expect(totalHeight(r)).toBe(110 + 20);
    // `const` is a keyword token — painted as a nested colored rn-text.
    const colored = r.root
      .findAllByType('rn-text' as never)
      .filter((t) => (t.props as { style?: { color?: string } }).style?.color != null);
    expect(colored.length).toBeGreaterThan(0);
    expect(
      colored.some((t) => String((t.props as { children: unknown }).children) === 'const'),
    ).toBe(true);
  });

  test('table columns split by shared content ratios', () => {
    const md = ['| A | BB |', '| --- | --- |', '| AA | B |'].join('\n');
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<App source={md} />);
    });
    // col0 = max(60, 120) + 2×5 = 130; col1 = max(110, 55) + 10 = 120; Σ = 250.
    // At width 400: col0 = 400×130/250 = 208, col1 = 192.
    const cellWidths = r.root
      .findAllByType('rn-view' as never)
      .map((v) => (v.props as { style?: { width?: number; padding?: number } }).style)
      .filter((s) => s?.padding === 5 && typeof s.width === 'number')
      .map((s) => s!.width);
    expect(cellWidths).toEqual([208, 192, 208, 192]);
    // Height: two 1-line rows (110 + 2×5) + 1px divider.
    expect(totalHeight(r)).toBe(2 * 120 + 1);
  });

  test('theme lineHeight override changes the measured height', () => {
    let r!: ReactTestRenderer;
    function Themed() {
      const items = [{ id: 'md' }];
      const instance = useMugenVirtualizer({ items });
      return (
        <MugenVList
          instance={instance}
          getKey={(m) => m.id}
          width={400}
          height={2000}
          overscan={0}
          font="100px Test"
          lineHeight={110}
          render={() => (
            <Markdown source={'AA'} theme={{ ...THEME, lineHeight: 200 }} />
          )}
        />
      );
    }
    act(() => {
      r = create(<Themed />);
    });
    expect(totalHeight(r)).toBe(200);
  });

  test('custom component override measures and renders', () => {
    const components = defineMarkdownComponents({
      heading: ({ children }) => <VStack padding={30}>{children}</VStack>,
    });
    let r!: ReactTestRenderer;
    function WithOverride() {
      const items = [{ id: 'md' }];
      const instance = useMugenVirtualizer({ items });
      return (
        <MugenVList
          instance={instance}
          getKey={(m) => m.id}
          width={400}
          height={2000}
          overscan={0}
          font="100px Test"
          lineHeight={110}
          render={() => <Markdown source={'# AA'} theme={THEME} components={components} />}
        />
      );
    }
    act(() => {
      r = create(<WithOverride />);
    });
    expect(totalHeight(r)).toBe(220 + 60);
  });
});

describe('streaming', () => {
  test('completed blocks keep element identity across appends', () => {
    const s1 = 'AAAA AAAA\n\nBB BB';
    const s2 = s1 + ' BB';
    const el1 = renderMarkdown(s1, { theme: THEME }) as ReactElement<{ children: ReactNode[] }>;
    const el2 = renderMarkdown(s2, { theme: THEME }) as ReactElement<{ children: ReactNode[] }>;
    expect(isValidElement(el1) && isValidElement(el2)).toBe(true);
    const kids1 = el1.props.children;
    const kids2 = el2.props.children;
    // First paragraph is untouched by the append — identical element.
    expect(kids2[0]).toBe(kids1[0]);
    // The streaming paragraph rebuilt.
    expect(kids2[1]).not.toBe(kids1[1]);
  });

  test('appends update the exact height', () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<App source={'AAAA'} />);
    });
    expect(totalHeight(r)).toBe(110);
    act(() => {
      r.update(<App source={'AAAA AAAA AAAA'} />);
    });
    expect(totalHeight(r)).toBe(330);
  });

  test('fade wraps only newly streamed lines', () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<App source={'AAAA'} fade />);
    });
    // Initial mount: nothing fades (the scope arms after the first commit).
    expect(r.root.findAllByType('rn-animated-view' as never).length).toBe(0);
    act(() => {
      r.update(<App source={'AAAA AAAA AAAA'} fade />);
    });
    // The two new lines mount under an armed scope → animated wrappers.
    expect(r.root.findAllByType('rn-animated-view' as never).length).toBe(2);
  });
});
