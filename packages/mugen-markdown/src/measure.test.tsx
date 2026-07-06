import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

// Deterministic rich-inline measurement: 8px per character, wrapped at the row
// width. Real metric accuracy is validated by the browser suite; here we only
// need exact, predictable line counts to assert the height arithmetic and that
// every default component is walkable.
vi.mock('@chenglou/pretext/rich-inline', () => ({
  prepareRichInline: (items: { text: string }[]) => ({ items }),
  measureRichInlineStats: (prepared: { items: { text: string }[] }, maxWidth: number) => {
    const chars = prepared.items.reduce((n, it) => n + it.text.length, 0);
    const width = chars * 8;
    return { lineCount: Math.max(1, Math.ceil(width / Math.max(1, maxWidth))), maxLineWidth: width };
  },
}));

import { MugenInstance } from '@wingleeio/mugen';
import { Markdown } from './markdown';
import { renderMarkdown } from './render';
import type { DeepPartial, MarkdownTheme } from './theme';

function measure(md: string, width = 600, theme?: DeepPartial<MarkdownTheme>): number {
  const inst = new MugenInstance<{ id: string }>();
  inst.setItems([{ id: '1' }]);
  inst.configure({
    getKey: (it) => it.id,
    render: () => createElement(Markdown, { source: md, ...(theme ? { theme } : null) }),
    defaults: { font: '16px sans-serif', lineHeight: 26 },
  });
  inst.setViewport(width, 400, 16);
  inst.sync();
  return inst.totalHeight();
}

function measureFade(md: string, width = 600): number {
  const inst = new MugenInstance<{ id: string }>();
  inst.setItems([{ id: '1' }]);
  inst.configure({
    getKey: (it) => it.id,
    render: () => createElement(Markdown, { source: md, fade: true }),
    defaults: { font: '16px sans-serif', lineHeight: 26 },
  });
  inst.setViewport(width, 400, 16);
  inst.sync();
  return inst.totalHeight();
}

describe('Markdown measurability (mugen walker)', () => {
  it('measures a document with every block type without throwing', () => {
    const doc = [
      '# Heading',
      '',
      'A paragraph with **bold**, *italic*, `code`, and a [link](https://x).',
      '',
      '- one',
      '- two',
      '',
      '1. first',
      '2. second',
      '',
      '> a quote',
      '',
      '```ts',
      'const x = 1',
      '```',
      '',
      '| a | b |',
      '|---|---|',
      '| 1 | 2 |',
      '',
      '---',
    ].join('\n');
    const h = measure(doc);
    expect(Number.isFinite(h)).toBe(true);
    expect(h).toBeGreaterThan(0);
  });

  it('measures a one-line paragraph as one line height', () => {
    // 11 chars × 8px = 88px < 600 → 1 line → body line height (26).
    expect(measure('hello world')).toBe(26);
  });

  it('wraps a long paragraph by width', () => {
    // 100 chars × 8px = 800px at width 200 → 4 lines → 4 × 26.
    expect(measure('x'.repeat(100), 200)).toBe(4 * 26);
  });

  it('measures a heading at its depth line height', () => {
    // depth-1 heading line height is 40; "Hi" fits one line.
    expect(measure('# Hi')).toBe(40);
  });

  it('measures a fenced code block from its line count', () => {
    // 3 lines × 21 + 2 × 14 padding = 91, independent of width.
    expect(measure('```\na\nb\nc\n```')).toBe(91);
    expect(measure('```\na\nb\nc\n```', 120)).toBe(91);
  });

  it('folds the code header bar into the measured height', () => {
    // Same block, plus the fixed-height chrome bar (default header height 38).
    const headed = measure('```\na\nb\nc\n```', 600, { code: { header: { show: true } } });
    expect(headed).toBe(91 + 38);
    // A custom bar height is honoured, and stays width-independent.
    const tall = measure('```\na\nb\nc\n```', 120, {
      code: { header: { show: true, height: 50 } },
    });
    expect(tall).toBe(91 + 50);
  });

  it('sums adjacent blocks with the block gap', () => {
    // two one-line paragraphs: 26 + 16 (blockGap) + 26.
    expect(measure('a\n\nb')).toBe(26 + 16 + 26);
  });

  it('measures a thematic break as its rule box', () => {
    // outer padding 8 on both sides + 1px rule line.
    expect(measure('---')).toBe(2 * 8 + 1);
  });

  it('re-measures exactly when the width changes', () => {
    const wide = measure('y'.repeat(60), 600); // 480px → 1 line → 26
    const narrow = measure('y'.repeat(60), 200); // 480px → 3 lines → 78
    expect(wide).toBe(26);
    expect(narrow).toBe(78);
  });

  it('the fade overlay adds no height — same as without fade', () => {
    // The veil canvas is out of flow, so a faded block measures identically.
    const doc = ['# Heading', '', 'A paragraph with several words.', '', '- one', '- two'].join('\n');
    expect(measureFade(doc)).toBe(measure(doc));
    expect(measureFade(doc, 200)).toBe(measure(doc, 200));
    // Fenced code under fade stays line-count exact too.
    expect(measureFade('```\na\nb\nc\n```')).toBe(measure('```\na\nb\nc\n```'));
  });

  it('a theme override changes the measured height', () => {
    const base = measure('hi'); // 26
    const tall = measure('hi', 600, { lineHeight: 40 });
    expect(base).toBe(26);
    expect(tall).toBe(40);
  });

  it('floors table columns and scrolls instead of crushing them on a narrow viewport', () => {
    // Six ~12+ char columns: every column's minimum hits the 96px floor, so the
    // table's minimum width (~576px) exceeds a phone viewport. Below that width
    // the table stops shrinking and scrolls — its height no longer depends on
    // the viewport, where the old proportional squeeze kept getting taller.
    const table = [
      '| AlphaBravoCharlie | DeltaEchoFoxtrot | GolfHotelIndia | JulietKiloLima | MikeOscar | PapaQuebec |',
      '|---|---|---|---|---|---|',
      '| one two three | four five six | seven eight | nine ten | eleven | twelve |',
    ].join('\n');

    const narrow = measure(table, 120);
    const narrower = measure(table, 60);
    // Floored + scrolling → width-independent below the minimum table width.
    expect(narrow).toBe(narrower);

    // A wide viewport wraps the columns less, so it is never taller than the
    // floored, scrolling table (and both are real, multi-line tables).
    const wide = measure(table, 1200);
    expect(wide).toBeGreaterThan(0);
    expect(wide).toBeLessThanOrEqual(narrow);
  });

  it('a larger minColumnWidth gives wider columns that wrap less', () => {
    const table = [
      '| Alpha | Bravo | Charlie | Delta | Echo |',
      '|---|---|---|---|---|',
      '| some words here | more words here | a few words | tiny bit | ok |',
    ].join('\n');
    // At a phone width both floor-and-scroll; the bigger floor forces wider
    // columns, so cells wrap less → shorter. (Both are width-independent here.)
    const wideFloor = measure(table, 200, { table: { minColumnWidth: 160 } });
    const tightFloor = measure(table, 200, { table: { minColumnWidth: 72 } });
    expect(wideFloor).toBeLessThan(tightFloor);
  });

  it('renderMarkdown returns null for empty source', () => {
    expect(renderMarkdown('')).toBeNull();
  });
});
