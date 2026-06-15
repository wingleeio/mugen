// The streaming fade tracks content length incrementally from MutationObserver
// records (no per-frame whole-DOM walk). This gate proves the tracking stays
// aligned: after appending, the veil covers the *new* text and not the old, and
// the copy button's label flip never re-veils settled content.
import { createElement } from 'react';
import { beforeAll, afterEach, describe, expect, it } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { Markdown } from './markdown';
// @ts-expect-error url import
import inter400 from './__fixtures__/inter-latin-400-normal.woff2?url';

afterEach(cleanup);
beforeAll(async () => {
  const f = new FontFace('Inter', `url(${inter400})`, { weight: '400' });
  document.fonts.add(await f.load());
});

const THEME = { fontFamily: 'Inter', monoFamily: 'monospace', fontSize: 15, lineHeight: 24, color: '#111' };

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const frames = async (n: number) => {
  for (let i = 0; i < n; i++) await raf();
};

function parts(host: HTMLElement) {
  const content = host.firstElementChild as HTMLElement;
  const canvas = host.querySelector('canvas') as HTMLCanvasElement;
  return { content, canvas };
}

/** Max alpha the veil canvas paints over the DOM range [start,end) of the content. */
function veilAlphaOverRange(content: HTMLElement, canvas: HTMLCanvasElement, start: number, end: number): number {
  // Map character offsets to a DOM Range (single text node in these tests).
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  let base = 0;
  const range = document.createRange();
  let setStart = false;
  for (let n = walker.nextNode() as Text | null; n != null; n = walker.nextNode() as Text | null) {
    const len = n.data.length;
    if (!setStart && base + len >= start) {
      range.setStart(n, Math.max(0, start - base));
      setStart = true;
    }
    if (setStart && base + len >= end) {
      range.setEnd(n, Math.max(0, end - base));
      break;
    }
    base += len;
  }
  const rect = range.getBoundingClientRect();
  const origin = canvas.getBoundingClientRect();
  const ctx = canvas.getContext('2d')!;
  const dpr = window.devicePixelRatio || 1;
  let maxA = 0;
  // Sample a few points along the range's middle row.
  const y = Math.round((rect.top + rect.height / 2 - origin.top) * dpr);
  for (let i = 1; i <= 5; i++) {
    const x = Math.round((rect.left - origin.left + (rect.width * i) / 6) * dpr);
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) continue;
    maxA = Math.max(maxA, ctx.getImageData(x, y, 1, 1).data[3]!);
  }
  return maxA;
}

describe('streaming fade: incremental length tracking', () => {
  it('veils the appended text but not the already-settled text', async () => {
    const App = ({ src }: { src: string }) =>
      createElement('div', { style: { width: '600px' } }, createElement(Markdown, { source: src, theme: THEME, fade: true }));

    const { container, rerender } = render(createElement(App, { src: 'alpha bravo charlie' }));
    const host = container.firstElementChild!.firstElementChild as HTMLElement;
    await frames(3); // painter attaches (useEffect) and seeds length; nothing veiled yet

    // Append more text — one streaming tick.
    rerender(createElement(App, { src: 'alpha bravo charlie delta echo foxtrot' }));
    await frames(2); // MutationObserver -> wake -> a frame paints the veil

    const { content, canvas } = parts(host);
    const oldA = veilAlphaOverRange(content, canvas, 0, 'alpha bravo charlie'.length);
    const newA = veilAlphaOverRange(content, canvas, 'alpha bravo charlie '.length, content.textContent!.length);

    // The just-arrived text is veiled; the settled text is not.
    expect(newA, 'appended text should be veiled').toBeGreaterThan(20);
    expect(oldA, 'settled text should not be re-veiled').toBeLessThan(10);
  });

  it('bounds the walk to the tail across many blocks (long stream)', async () => {
    // Many settled paragraphs (many text nodes), then append to the last one.
    // The veil must land on the fresh tail and leave every earlier block alone —
    // exercising the backward, tail-bounded geometry walk across blocks.
    const base = Array.from({ length: 10 }, (_, i) => `paragraph number ${i} with several plain words in it`).join('\n\n');
    const tail = ' freshly appended tail words here';
    const App = ({ src }: { src: string }) =>
      createElement('div', { style: { width: '600px' } }, createElement(Markdown, { source: src, theme: THEME, fade: true }));
    const { container, rerender } = render(createElement(App, { src: base }));
    const host = container.firstElementChild!.firstElementChild as HTMLElement;
    await frames(3);

    rerender(createElement(App, { src: base + tail }));
    await frames(2);

    const { content, canvas } = parts(host);
    const total = content.textContent!.length;
    const newA = veilAlphaOverRange(content, canvas, total - tail.length + 1, total);
    const oldA = veilAlphaOverRange(content, canvas, 0, 40); // the first paragraph
    expect(newA, 'the appended tail is veiled').toBeGreaterThan(20);
    expect(oldA, 'earlier blocks are untouched').toBeLessThan(10);
  });

  it('a copy-button label flip is chrome — never counts or re-veils', async () => {
    // A code block renders a copy button inside the faded content. Flipping its
    // label "Copy" -> "Copied" is a mutation, but it's chrome: it must not shift
    // the length or veil the settled code below it.
    const codeTheme = {
      ...THEME,
      code: { background: '#eee', padding: 8, fontSize: 13, lineHeight: 18, header: { show: true, height: 32, fontSize: 11 } },
    };
    const App = ({ src }: { src: string }) =>
      createElement('div', { style: { width: '600px' } }, createElement(Markdown, { source: src, theme: codeTheme, fade: true }));
    const { container } = render(createElement(App, { src: '```js\nconst x = 1;\nconst y = 2;\n```' }));
    const host = container.firstElementChild!.firstElementChild as HTMLElement;
    await frames(4); // settle; any initial veil fades

    const { content, canvas } = parts(host);
    const btn = content.querySelector('button')!;
    expect(btn.textContent).toBe('Copy');
    btn.textContent = 'Copied'; // simulate the copy interaction
    await frames(2);

    // The code text (everything after the button) must not be veiled.
    const a = veilAlphaOverRange(content, canvas, 0, content.textContent!.length);
    expect(a, 'flipping the copy label must not re-veil the code').toBeLessThan(10);
  });

  it('settles (clears) after the fade duration', async () => {
    const App = ({ src }: { src: string }) =>
      createElement('div', { style: { width: '600px' } }, createElement(Markdown, { source: src, theme: THEME, fade: true }));
    const { container, rerender } = render(createElement(App, { src: 'one two' }));
    const host = container.firstElementChild!.firstElementChild as HTMLElement;
    await frames(3);
    rerender(createElement(App, { src: 'one two three four five six seven' }));
    await new Promise((r) => setTimeout(r, 600)); // longer than max fade
    await frames(2);
    const { content, canvas } = parts(host);
    const a = veilAlphaOverRange(content, canvas, 0, content.textContent!.length);
    expect(a, 'veil clears once the fade completes').toBeLessThan(10);
  });
});
