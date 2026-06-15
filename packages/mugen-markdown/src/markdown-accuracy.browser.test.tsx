// Accuracy gate: a real-world markdown document (the docs ai-chat streaming
// answer — headings, lists, fenced code, a table, a blockquote, inline
// bold/italic/code/links) rendered at a mobile content width with real
// webfonts, asserting every block's computed height equals its painted DOM
// height exactly. This is the suite that catches strut/baseline-union bugs,
// flex width-distribution drift, and UA-style leaks that per-primitive unit
// tests can't see.
import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { MugenInstance } from '@wingleeio/mugen';
import { Markdown } from './markdown';
import { defineMarkdownComponents } from './types';
import { measureInline } from './primitives/rich-text';
import { parseMarkdown } from './parse';
// @ts-expect-error vite raw import
import fixture from './__fixtures__/ai-chat-live.md?raw';
// @ts-expect-error vite url import
import inter400 from './__fixtures__/inter-latin-400-normal.woff2?url';
// @ts-expect-error vite url import
import inter500 from './__fixtures__/inter-latin-500-normal.woff2?url';
// @ts-expect-error vite url import
import inter600 from './__fixtures__/inter-latin-600-normal.woff2?url';
// @ts-expect-error vite url import
import geistMono from './__fixtures__/geist-mono-latin-wght-normal.woff2?url';

afterEach(cleanup);

beforeAll(async () => {
  const faces = [
    new FontFace('Inter', `url(${inter400})`, { weight: '400' }),
    new FontFace('Inter', `url(${inter500})`, { weight: '500' }),
    new FontFace('Inter', `url(${inter600})`, { weight: '600' }),
    new FontFace('Geist Mono Variable', `url(${geistMono})`, { weight: '100 900' }),
  ];
  for (const f of faces) document.fonts.add(await f.load());
});

const WIDTH = 316;
const THEME = {
  fontFamily: 'Inter',
  monoFamily: '"Geist Mono Variable", monospace',
  fontSize: 15,
  lineHeight: 24,
  color: '#111',
  blockGap: 12,
  heading: { color: '#111', weight: 650 },
  link: { color: '#6366f1', underline: true },
  inlineCode: { background: '#eee', color: '#111', sizeScale: 0.9 },
  code: { background: '#eee', color: '#111', padding: 12, radius: 10, fontSize: 13, lineHeight: 20 },
  blockquote: { borderColor: '#ccc', color: '#666', padding: 12, gap: 8, borderWidth: 3 },
  list: { gap: 6, indent: 24, markerColor: '#666' },
};

function computedHeight(md: string): number {
  const inst = new MugenInstance<{ id: string }>();
  inst.setItems([{ id: '1' }]);
  inst.configure({
    getKey: (it) => it.id,
    render: () => createElement(Markdown, { source: md, theme: THEME }),
    defaults: {},
  });
  inst.setViewport(WIDTH, 600, 16);
  inst.sync();
  return inst.totalHeight();
}

function splitBlocks(source: string): string[] {
  const parts = source.split(/\n\n+/);
  const out: string[] = [];
  let open = false;
  for (const p of parts) {
    if (open) out[out.length - 1] += '\n\n' + p;
    else out.push(p);
    const fences = (out[out.length - 1]!.match(/```/g) ?? []).length;
    open = fences % 2 === 1;
  }
  return out;
}

describe('real-document markdown: computed vs DOM per block', () => {
  it('every block measures exactly what it paints', () => {
    const source = fixture as string;
    const root = parseMarkdown(source);
    const blocks = root.children;
    const chunks = splitBlocks(source);

    const { container } = render(
      createElement(
        'div',
        { style: { width: `${WIDTH}px` } },
        createElement(Markdown, { source, theme: THEME }),
      ),
    );
    const stack = container.firstElementChild!.firstElementChild!;
    const domBlocks = [...stack.children].map((c) => c.getBoundingClientRect().height);

    const rows: string[] = [];
    for (let i = 0; i < blocks.length; i++) {
      const md = chunks[i] ?? '';
      const ch = computedHeight(md);
      const dh = domBlocks[i] ?? -1;
      const diff = ch - dh;
      if (Math.abs(diff) > 0.5) {
        rows.push(
          `${String(i).padStart(2)} ${blocks[i]!.type.padEnd(12)} computed=${ch.toFixed(2)} dom=${dh.toFixed(2)} diff=${diff.toFixed(2)} | ${md.replace(/\s+/g, ' ').slice(0, 40)}`,
        );
      }
    }
    expect(rows, '\n' + rows.join('\n')).toEqual([]);
    expect(domBlocks.length).toBe(blocks.length);
  });
});

describe('code block with a chrome header: computed vs DOM', () => {
  // THEME with the header bar enabled. The bar is a fixed-height box, so the
  // block must still paint exactly what the walker computes (header + code).
  const HEADER_THEME = {
    ...THEME,
    code: {
      ...THEME.code,
      header: {
        show: true,
        height: 38,
        fontSize: 11.5,
        background: '#f3f3f3',
        color: '#555',
        borderColor: '#ddd',
        buttonBackground: '#fff',
      },
    },
  };

  function computedHeaderHeight(md: string): number {
    const inst = new MugenInstance<{ id: string }>();
    inst.setItems([{ id: '1' }]);
    inst.configure({
      getKey: (it) => it.id,
      render: () => createElement(Markdown, { source: md, theme: HEADER_THEME }),
      defaults: {},
    });
    inst.setViewport(WIDTH, 600, 16);
    inst.sync();
    return inst.totalHeight();
  }

  it('paints header + code at exactly the computed height', () => {
    // A long line forces the <pre> to scroll horizontally — the header must
    // not absorb or add any of that, so computed still equals painted.
    const md = [
      '```ts',
      'const x = 1',
      'function reallyLongIdentifierThatScrollsHorizontally(a: number, b: number) {}',
      'return x',
      '```',
    ].join('\n');

    const computed = computedHeaderHeight(md);
    const { container } = render(
      createElement(
        'div',
        { style: { width: `${WIDTH}px` } },
        createElement(Markdown, { source: md, theme: HEADER_THEME }),
      ),
    );
    const stack = container.firstElementChild!.firstElementChild!;
    const block = stack.firstElementChild as HTMLElement;
    const painted = block.getBoundingClientRect().height;
    expect(Math.abs(computed - painted)).toBeLessThanOrEqual(0.5);

    // And the bar itself painted exactly its declared height.
    const bar = block.firstElementChild as HTMLElement;
    expect(Math.abs(bar.getBoundingClientRect().height - 38)).toBeLessThanOrEqual(0.5);
  });

  it('confirms with "Copied" even when the async clipboard API is unavailable', async () => {
    // Simulate an insecure context (e.g. a non-localhost http origin), where
    // `navigator.clipboard` is undefined — the button must fall back to the
    // legacy `execCommand` path and still flip to "Copied".
    Object.defineProperty(navigator, 'clipboard', { configurable: true, get: () => undefined });
    const realExec = document.execCommand;
    let copiedCmd: string | null = null;
    document.execCommand = (cmd: string) => {
      copiedCmd = cmd;
      return true;
    };
    try {
      const { container } = render(
        createElement(
          'div',
          { style: { width: `${WIDTH}px` } },
          createElement(Markdown, { source: '```ts\nconst x = 1\n```', theme: HEADER_THEME }),
        ),
      );
      const btn = container.querySelector('button')!;
      expect(btn.textContent).toBe('Copy');
      btn.click();
      await waitFor(() => expect(btn.textContent).toBe('Copied'));
      expect(copiedCmd).toBe('copy');
    } finally {
      document.execCommand = realExec;
      delete (navigator as { clipboard?: unknown }).clipboard;
    }
  });
});

describe('inline box (the inline Escape): computed vs DOM', () => {
  // An inline override that turns every link into a fixed-size measured box —
  // a 64×14 pill. `advance` is what the measure reserves; the painted content
  // is exactly 64px wide, so wrapping (and therefore height) must match.
  const BOX_W = 64;
  const components = defineMarkdownComponents({
    inline: {
      link: () => [
        {
          advance: BOX_W,
          content: createElement('span', {
            style: {
              display: 'inline-block',
              width: `${BOX_W}px`,
              height: '14px',
              background: '#cdd',
              borderRadius: '7px',
              verticalAlign: 'middle',
            },
          }),
        },
      ],
    },
  });

  function computedBox(md: string, width: number): number {
    const inst = new MugenInstance<{ id: string }>();
    inst.setItems([{ id: '1' }]);
    inst.configure({
      getKey: (it) => it.id,
      render: () => createElement(Markdown, { source: md, theme: THEME, components }),
      defaults: {},
    });
    inst.setViewport(width, 600, 16);
    inst.sync();
    return inst.totalHeight();
  }

  function paintedBox(md: string, width: number): number {
    const { container } = render(
      createElement(
        'div',
        { style: { width: `${width}px` } },
        createElement(Markdown, { source: md, theme: THEME, components }),
      ),
    );
    const stack = container.firstElementChild!.firstElementChild as HTMLElement;
    return stack.getBoundingClientRect().height;
  }

  function computedPlain(md: string, width: number): number {
    const inst = new MugenInstance<{ id: string }>();
    inst.setItems([{ id: '1' }]);
    inst.configure({
      getKey: (it) => it.id,
      render: () => createElement(Markdown, { source: md, theme: THEME }),
      defaults: {},
    });
    inst.setViewport(width, 600, 16);
    inst.sync();
    return inst.totalHeight();
  }

  it('counts the box advance in the measure — and matches the paint', () => {
    // A wide box that forces a wrap a 1-char link never would. The box must be
    // reserved (else it would be dropped like a zero-width placeholder), so the
    // box version is a line taller, and computed equals painted. Width is clear
    // of any wrap boundary, so the sub-px inter-item gap can't tip a line.
    const wide = defineMarkdownComponents({
      inline: {
        link: () => [
          { advance: 200, content: createElement('span', { style: { display: 'inline-block', width: '200px', height: '14px', verticalAlign: 'middle' } }) },
        ],
      },
    });
    const md = 'word [c](x)';
    const computedWideBox = (() => {
      const inst = new MugenInstance<{ id: string }>();
      inst.setItems([{ id: '1' }]);
      inst.configure({ getKey: (it) => it.id, render: () => createElement(Markdown, { source: md, theme: THEME, components: wide }), defaults: {} });
      inst.setViewport(120, 600, 16);
      inst.sync();
      return inst.totalHeight();
    })();
    // Without the box (link → its char), "word c" is one line; with the 200px
    // box it wraps to two.
    expect(computedWideBox).toBeGreaterThan(computedPlain(md, 120));
    const { container } = render(
      createElement(
        'div',
        { style: { width: '120px' } },
        createElement(Markdown, { source: md, theme: THEME, components: wide }),
      ),
    );
    const stack = container.firstElementChild!.firstElementChild as HTMLElement;
    expect(Math.abs(computedWideBox - stack.getBoundingClientRect().height)).toBeLessThanOrEqual(0.5);
  });

  it('a mid-sentence box matches the paint at the content width', () => {
    // The everyday case: a box in flowing text at a normal content width.
    const md =
      'Alpha beta gamma [c](x) delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho.';
    expect(Math.abs(computedBox(md, WIDTH) - paintedBox(md, WIDTH))).toBeLessThanOrEqual(0.5);
  });

  it('a text pill sized with measureInline matches the paint', () => {
    // The canonical use: a citation pill = the label's advance + padding. The
    // painted pill is `display:inline-block` with that exact width.
    const font = `${THEME.fontSize}px Inter` as const;
    const PAD = 12;
    const pillComponents = defineMarkdownComponents({
      inline: {
        link: (_node, ctx) => {
          const label = '1';
          const w = ctx.measure(label, font) + PAD;
          return [
            {
              advance: w,
              content: createElement(
                'span',
                {
                  style: {
                    display: 'inline-block',
                    width: `${w}px`,
                    height: '16px',
                    lineHeight: '16px',
                    textAlign: 'center',
                    fontSize: `${THEME.fontSize}px`,
                    background: '#dde',
                    borderRadius: '8px',
                    verticalAlign: 'middle',
                  },
                },
                label,
              ),
            },
          ];
        },
      },
    });
    const md = 'The sky is blue [1](s1) because light scatters [1](s2) off air molecules everywhere.';
    const inst = new MugenInstance<{ id: string }>();
    inst.setItems([{ id: '1' }]);
    inst.configure({
      getKey: (it) => it.id,
      render: () =>
        createElement(Markdown, { source: md, theme: THEME, components: pillComponents }),
      defaults: {},
    });
    inst.setViewport(316, 600, 16);
    inst.sync();
    const computed = inst.totalHeight();
    const { container } = render(
      createElement(
        'div',
        { style: { width: '316px' } },
        createElement(Markdown, { source: md, theme: THEME, components: pillComponents }),
      ),
    );
    const stack = container.firstElementChild!.firstElementChild as HTMLElement;
    const painted = stack.getBoundingClientRect().height;
    // Sanity: measureInline returns a positive advance.
    expect(measureInline('1', font)).toBeGreaterThan(0);
    expect(Math.abs(computed - painted)).toBeLessThanOrEqual(0.5);
  });
});
