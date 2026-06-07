import { describe, it, expect, beforeEach } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import { renderMarkdown, clearParseCache } from './index';

beforeEach(() => clearParseCache());

function blocks(node: ReactNode): ReactNode[] {
  // renderMarkdown returns the top-level VStack; its children are the blocks.
  return ((node as ReactElement).props as { children: ReactNode[] }).children;
}

describe('block element memoization (streaming)', () => {
  it('reuses the identical element for completed blocks as the source grows', () => {
    const head = '# Title\n\nFirst paragraph is done.\n\n';
    const a = renderMarkdown(head + 'second para stream');
    const b = renderMarkdown(head + 'second para streaming more now'); // extends a

    const ca = blocks(a);
    const cb = blocks(b);
    expect(ca.map((c) => (c as ReactElement)?.key)).toEqual(cb.map((c) => (c as ReactElement)?.key));
    expect(cb[0]).toBe(ca[0]); // heading — completed → same element reference
    expect(cb[1]).toBe(ca[1]); // first paragraph — completed → same reference
    expect(cb[2]).not.toBe(ca[2]); // streaming paragraph — new reference
  });

  it('reuses elements by content signature even when node references are fresh', () => {
    // A fresh parse (after clearing) produces brand-new node refs, but the
    // content cache reuses the rendered elements — this is what lets unchanged
    // items inside a re-parsed streaming block bail out.
    const src = '# A\n\nhello world\n\n- one\n- two';
    const a = blocks(renderMarkdown(src));
    clearParseCache(); // next parse → fresh node references
    const b = blocks(renderMarkdown(src));
    expect(b[0]).toBe(a[0]); // heading
    expect(b[1]).toBe(a[1]); // paragraph
    expect(b[2]).toBe(a[2]); // list
  });

  it('rebuilds when the theme changes (cache is theme-scoped)', () => {
    const src = 'just one paragraph';
    const a = renderMarkdown(src);
    const b = renderMarkdown(src); // identical theme → reuse
    const c = renderMarkdown(src, { theme: { lineHeight: 40 } }); // different theme → rebuild
    expect(blocks(b)[0]).toBe(blocks(a)[0]);
    expect(blocks(c)[0]).not.toBe(blocks(a)[0]);
  });
});
