// Accuracy gate: a real-world markdown document (the docs ai-chat streaming
// answer — headings, lists, fenced code, a table, a blockquote, inline
// bold/italic/code/links) rendered at a mobile content width with real
// webfonts, asserting every block's computed height equals its painted DOM
// height exactly. This is the suite that catches strut/baseline-union bugs,
// flex width-distribution drift, and UA-style leaks that per-primitive unit
// tests can't see.
import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MugenInstance } from '@wingleeio/mugen';
import { Markdown } from './markdown';
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
