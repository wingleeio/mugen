import { afterEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { getPrimitiveDef, type MeasureContext } from '@wingleeio/mugen';
import { CodeBlock, type CodeBlockProps } from './primitives/code-block';

// Real-browser suite for the canvas-overlay highlighter: the overlay must paint
// (text flips transparent, canvases appear) without moving a single pixel of
// layout — the block's DOM height stays exactly the analytic measure.

const codeDef = getPrimitiveDef(CodeBlock)!;

function measured(props: CodeBlockProps, width = 600): number {
  const ctx: MeasureContext = { defaults: {}, width, measure: () => 0 };
  return codeDef.measure(props as unknown as Record<string, unknown>, ctx);
}

const roots: { root: Root; host: HTMLElement }[] = [];

function mount(props: CodeBlockProps): HTMLElement {
  const host = document.createElement('div');
  host.style.width = '600px';
  document.body.appendChild(host);
  const root = createRoot(host);
  root.render(createElement(CodeBlock, props));
  roots.push({ root, host });
  return host;
}

afterEach(() => {
  for (const { root, host } of roots.splice(0)) {
    root.unmount();
    host.remove();
  }
});

async function until(cond: () => boolean, what: string, ms = 4000): Promise<void> {
  const t0 = performance.now();
  while (!cond()) {
    if (performance.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 16));
  }
}

/** Wait out React's async first commit and return the rendered `<code>`. */
async function codeOf(host: HTMLElement): Promise<HTMLElement> {
  await until(() => host.querySelector('code') != null, 'code element');
  return host.querySelector('code')!;
}

const TRANSPARENT = 'rgba(0, 0, 0, 0)';

const SAMPLE = [
  'function greet(name) {',
  '  // say hello politely',
  '  const msg = `hi ${name}`;',
  '\tconst tabbed = true;',
  '  return msg.length > 0;',
  '}',
].join('\n');

const base: CodeBlockProps = {
  value: SAMPLE,
  lang: 'js',
  font: '13.5px monospace',
  lineHeight: 21,
  padding: 14,
};

describe('CodeBlock canvas highlighting (real browser)', () => {
  it('paints the overlay and flips the text transparent, height unchanged', async () => {
    const host = mount(base);
    const code = await codeOf(host);
    await until(() => getComputedStyle(code).color === TRANSPARENT, 'highlight to paint');
    const canvases = [...host.querySelectorAll('canvas')];
    expect(canvases.length).toBeGreaterThan(0);
    expect(canvases[0]!.width).toBeGreaterThan(0);
    const overlay = canvases[0]!.parentElement!;
    expect(getComputedStyle(overlay).visibility).toBe('visible');

    const pre = host.querySelector('pre')!;
    expect(pre.getBoundingClientRect().height).toBeCloseTo(measured(base), 1);
  });

  it('keeps the canvas inside the measured content box', async () => {
    const host = mount(base);
    const code = await codeOf(host);
    await until(() => getComputedStyle(code).color === TRANSPARENT, 'highlight to paint');
    const pre = host.querySelector('pre')!;
    const canvas = host.querySelector('canvas')!;
    const cr = canvas.getBoundingClientRect();
    const pr = pre.getBoundingClientRect();
    expect(cr.top).toBeCloseTo(pr.top + 14, 1);
    expect(cr.left).toBeCloseTo(pr.left + 14, 1);
    expect(cr.bottom).toBeLessThanOrEqual(pr.bottom - 14 + 0.5);
  });

  it('repaints incrementally when the value streams in', async () => {
    const host = mount(base);
    const code = await codeOf(host);
    await until(() => getComputedStyle(code).color === TRANSPARENT, 'initial paint');

    const grown = { ...base, value: `${SAMPLE}\nconst more = greet('again');` };
    roots[roots.length - 1]!.root.render(createElement(CodeBlock, grown));
    const lines = grown.value.split('\n').length;
    await until(() => {
      const canvas = host.querySelector('canvas');
      return canvas != null && canvas.getBoundingClientRect().height >= lines * 21 - 0.5;
    }, 'appended lines to paint');
    // The text never un-flips while streaming small appends.
    expect(getComputedStyle(code).color).toBe(TRANSPARENT);
    expect(host.querySelector('pre')!.getBoundingClientRect().height).toBeCloseTo(
      measured(grown),
      1,
    );
  });

  it('leaves unknown languages as plain visible text', async () => {
    const host = mount({ ...base, lang: 'not-a-language' });
    await codeOf(host);
    await new Promise((r) => setTimeout(r, 120));
    expect(host.querySelector('canvas')).toBeNull();
    expect(getComputedStyle(host.querySelector('code')!).color).not.toBe(TRANSPARENT);
  });

  it('highlight={false} disables the overlay', async () => {
    const host = mount({ ...base, highlight: false });
    await codeOf(host);
    await new Promise((r) => setTimeout(r, 120));
    expect(host.querySelector('canvas')).toBeNull();
    expect(getComputedStyle(host.querySelector('code')!).color).not.toBe(TRANSPARENT);
  });

  it('restores the DOM text when unmounted mid-highlight', async () => {
    const host = mount(base);
    const code = await codeOf(host);
    await until(() => getComputedStyle(code).color === TRANSPARENT, 'highlight to paint');
    // Re-render without highlighting: the session is destroyed and must hand
    // the glyphs back to the DOM.
    roots[roots.length - 1]!.root.render(createElement(CodeBlock, { ...base, highlight: false }));
    await until(
      () => getComputedStyle(host.querySelector('code')!).color !== TRANSPARENT,
      'text to be restored',
    );
    expect(host.querySelector('canvas')).toBeNull();
  });
});
