import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MugenInstance } from '@wingleeio/mugen';
import { Markdown } from './markdown';
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

const THEME = {
  fontFamily: 'Inter',
  monoFamily: '"Geist Mono Variable", monospace',
  fontSize: 14,
  lineHeight: 22,
  color: '#e7e7e7',
  blockGap: 12,
  heading: { color: '#f5f5f5', weight: 600 },
  link: { color: '#e7e7e7', underline: true },
  inlineCode: { color: '#f0f0f0', background: 'rgba(255,255,255,0.08)' },
  code: { background: 'rgba(255,255,255,0.035)', color: '#e7e7e7', borderColor: 'rgba(255,255,255,0.08)' },
  list: { markerColor: '#a1a1a1' },
};

const B = [
  `- **One theme, black by design** — true \`#000\` canvas, \`#0a0a0a\` panels, 1px white-alpha hairlines that brighten on hover. Forced dark; the light/dark toggles are gone from both layouts (a single-theme site shouldn't ask).`,
  `- **Geist + Geist Mono** — the literal Vercel type system, replacing Bricolage/Hanken/JetBrains.`,
  `- **Monochrome discipline with one blue** — grayscale hierarchy everywhere (\`#ededed\` → \`#a1a1a1\`), with \`#3291ff\` reserved exclusively for the *editor's own machinery*: caret, selection, links, mention chips, todo checkboxes, the nav dot, and ori's benchmark line. The accent means "this is the editor."`,
  `- **Atmosphere, not decoration** — an engineering dot-grid dissolving from the top, one top-center spotlight, grid-intersection crosshairs at the hero corners, and a soft accent aura behind the editor window. The old paper grain and manuscript baselines are gone.`,
  `- **Vercel-signature moments** — gradient headline (white fading to gray, clipped to glyphs), white pill CTA with a calm luminance hover, ghost secondary button, hairline-gap card grids.`,
];
const HEAD = `**The design system**`;
const FINAL = `**Verified live:** hero, live editor demo, benchmark charts (competitor hues still read on black), pipeline/features/packages, footer, and the docs interior (sidebar, TOC, code blocks) — plus a clean production build.`;

function computedHeight(md: string, width: number): number {
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

function domHeight(md: string, width: number): number {
  const { container, unmount } = render(
    createElement('div', { style: { width: `${width}px` } }, createElement(Markdown, { source: md, theme: THEME })),
  );
  const h = (container.firstElementChild!.firstElementChild! as HTMLElement).getBoundingClientRect().height;
  unmount();
  return h;
}

describe('slash-joined tokens (Blink parity)', () => {
  it('whole document computed == painted across widths', () => {
    const SOURCE = `${HEAD}\n${B.join('\n')}\n\n${FINAL}`;
    const bad: string[] = [];
    for (const width of [316, 480, 560, 636, 700, 704, 720, 736, 800]) {
      const ch = computedHeight(SOURCE, width);
      const { container, unmount } = render(
        createElement(
          'div',
          { style: { width: `${width}px` } },
          createElement(Markdown, { source: SOURCE, theme: THEME }),
        ),
      );
      const el = container.firstElementChild!.firstElementChild! as HTMLElement;
      const dh = el.getBoundingClientRect().height;
      if (Math.abs(ch - dh) > 0.5) bad.push(`width=${width} computed=${ch} dom=${dh}`);
      unmount();
    }
    expect(bad, '\n' + bad.join('\n')).toEqual([]);
  });
});
