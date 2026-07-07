import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { getPrimitiveDef, type MeasureContext } from '@wingleeio/mugen';
import { RichText, type RichTextRun } from './primitives/rich-text';
import { CodeBlock } from './primitives/code-block';

afterEach(cleanup);

// Real pretext rich-inline against the real DOM — the accuracy gate for the
// mixed-font wrapping that single-`<Text>` measurement can't express. Named
// families (`Arial`, `monospace`) so canvas and DOM fall back consistently.
const richDef = getPrimitiveDef(RichText)!;
const codeDef = getPrimitiveDef(CodeBlock)!;

function ctxAt(width: number): MeasureContext {
  return { defaults: {}, width, measure: () => 0 };
}

function analyticRich(runs: RichTextRun[], lineHeight: number, width: number): number {
  return richDef.measure({ runs, lineHeight } as unknown as Record<string, unknown>, ctxAt(width));
}

function domRich(runs: RichTextRun[], lineHeight: number, width: number): number {
  const el = document.createElement('div');
  Object.assign(el.style, {
    lineHeight: `${lineHeight}px`,
    whiteSpace: 'normal',
    overflowWrap: 'anywhere',
    margin: '0',
    padding: '0',
    width: `${width}px`,
    position: 'absolute',
    left: '-9999px',
    top: '0',
    visibility: 'hidden',
  });
  for (const run of runs) {
    if (run.break) {
      el.appendChild(document.createElement('br'));
      continue;
    }
    const tag = run.as ?? (run.href != null ? 'a' : 'span');
    const span = document.createElement(tag);
    span.style.font = run.font ?? '';
    // Mirror the render: zero-leading runs never extend a line box, so the
    // container's strut alone defines line height.
    span.style.lineHeight = '0';
    if (run.noBreak) span.style.whiteSpace = 'nowrap';
    span.textContent = run.text ?? '';
    el.appendChild(span);
  }
  document.body.appendChild(el);
  const h = el.getBoundingClientRect().height;
  document.body.removeChild(el);
  return h;
}

const LH = 22;

const corpus: { label: string; runs: RichTextRun[] }[] = [
  { label: 'single run', runs: [{ text: 'Hello world, a plain sentence.', font: '16px Arial' }] },
  {
    label: 'bold + normal',
    runs: [
      { text: 'This is ', font: '16px Arial' },
      { text: 'very bold', font: '700 16px Arial' },
      { text: ' and then normal again for a while.', font: '16px Arial' },
    ],
  },
  {
    label: 'normal + inline code',
    runs: [
      { text: 'Call ', font: '16px Arial' },
      { text: 'measureRichInlineStats(prepared, width)', font: '14px monospace', as: 'code' },
      { text: ' to get the line count.', font: '16px Arial' },
    ],
  },
  {
    label: 'mixed marks, multi-line',
    runs: [
      { text: 'The quick ', font: '16px Arial' },
      { text: 'brown fox ', font: '700 16px Arial' },
      { text: 'jumps over ', font: 'italic 16px Arial' },
      { text: 'the lazy dog ', font: '16px Arial' },
      { text: 'repeatedly() ', font: '14px monospace', as: 'code' },
      { text: 'across several wrapping lines of text content here.', font: '16px Arial' },
    ],
  },
  {
    label: 'hard break',
    runs: [
      { text: 'first line that is reasonably long and wraps maybe', font: '16px Arial' },
      { text: '', break: true },
      { text: 'second line after a hard break', font: '16px Arial' },
    ],
  },
  {
    label: 'CJK + emoji + bold',
    runs: [
      { text: '这是一段中文，', font: '16px Arial' },
      { text: '加粗的部分', font: '700 16px Arial' },
      { text: '，然后是 emoji 🚀✨🎉 结尾。', font: '16px Arial' },
    ],
  },
];

describe('RichText analytic height ≈ DOM (mixed-font accuracy gate)', () => {
  for (const { label, runs } of corpus) {
    for (const width of [180, 280, 420]) {
      it(`${label} @ ${width}px`, () => {
        const computed = analyticRich(runs, LH, width);
        const actual = domRich(runs, LH, width);
        expect(Math.abs(computed - actual)).toBeLessThanOrEqual(1.5);
      });
    }
  }
});

// ── CodeBlock ─────────────────────────────────────────────────────────────────

function domCode(value: string, font: string, lineHeight: number, padding: number): number {
  const pre = document.createElement('pre');
  Object.assign(pre.style, {
    margin: '0',
    padding: `${padding}px`,
    overflowX: 'auto',
    font,
    lineHeight: `${lineHeight}px`,
    boxSizing: 'border-box',
    position: 'absolute',
    left: '-9999px',
    top: '0',
    visibility: 'hidden',
    width: '300px',
  });
  const code = document.createElement('code');
  code.style.font = 'inherit';
  code.style.whiteSpace = 'pre';
  code.textContent = value;
  pre.appendChild(code);
  document.body.appendChild(pre);
  const h = pre.getBoundingClientRect().height;
  document.body.removeChild(pre);
  return h;
}

describe('code disables ligatures (literal ===/!= glyphs), body keeps them', () => {
  it('inline code + code block compute font-variant-ligatures: none; body: normal', () => {
    const { container } = render(
      createElement(RichText, {
        lineHeight: 22,
        runs: [
          { text: 'plus ', font: '16px Arial' },
          {
            text: 'a === b',
            font: '14px monospace',
            as: 'code',
            noLigatures: true,
            background: '#eee',
          },
        ],
      } as unknown as Parameters<typeof RichText>[0]),
    );
    const bodySpan = container.querySelector('span')!;
    const inlineCode = container.querySelector('code')!;
    expect(getComputedStyle(inlineCode).fontVariantLigatures).toBe('none');
    // Body prose keeps its ligatures — only code opts out.
    expect(getComputedStyle(bodySpan).fontVariantLigatures).toBe('normal');

    const { container: cc } = render(
      createElement(CodeBlock, {
        value: 'a === b !== c => d',
        font: '13px monospace',
        lineHeight: 20,
        highlight: false,
      } as unknown as Parameters<typeof CodeBlock>[0]),
    );
    const pre = cc.querySelector('pre')!;
    // Set on the <pre>, inherited by the <code>.
    expect(getComputedStyle(pre).fontVariantLigatures).toBe('none');
  });
});

describe('CodeBlock analytic height ≈ DOM', () => {
  const FONT = '13px monospace';
  const CLH = 20;
  const PAD = 12;
  for (const value of ['one line', 'a\nb\nc', 'x\n'.repeat(8).trimEnd(), '']) {
    it(`${JSON.stringify(value.slice(0, 12))} (${value.split('\n').length} lines)`, () => {
      const computed = codeDef.measure(
        { value, font: FONT, lineHeight: CLH, padding: PAD } as unknown as Record<string, unknown>,
        ctxAt(300),
      );
      const actual = domCode(value, FONT, CLH, PAD);
      expect(Math.abs(computed - actual)).toBeLessThanOrEqual(1.5);
    });
  }
});
