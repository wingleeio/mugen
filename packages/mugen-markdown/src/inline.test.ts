import { describe, expect, it } from 'vitest';
import type { PhrasingContent } from 'mdast';
import { flattenInline, baseFormat } from './inline';
import { defaultTheme } from './theme';
import type { RichTextRun } from './primitives/rich-text';

describe('inline run building', () => {
  it('flags monospace/code runs with noLigatures, leaving body runs alone', () => {
    const nodes: PhrasingContent[] = [
      { type: 'text', value: 'run ' },
      { type: 'inlineCode', value: 'a === b' },
    ];
    const out: RichTextRun[] = [];
    flattenInline(nodes, baseFormat(defaultTheme), defaultTheme, out);

    const body = out.find((r) => r.text === 'run ');
    const code = out.find((r) => r.as === 'code');
    // Body text keeps its ligatures; code renders literal `===`.
    expect(body?.noLigatures).toBeFalsy();
    expect(code?.noLigatures).toBe(true);
  });

  it('flags inline code inside a heading/bold context too', () => {
    const nodes: PhrasingContent[] = [
      { type: 'strong', children: [{ type: 'inlineCode', value: '!=' }] },
    ];
    const out: RichTextRun[] = [];
    flattenInline(nodes, baseFormat(defaultTheme, { weight: 700 }), defaultTheme, out);
    const code = out.find((r) => r.as === 'code');
    expect(code?.noLigatures).toBe(true);
  });
});
