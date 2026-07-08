import { describe, it, expect, beforeEach } from 'vitest';
import type { Root, RootContent } from 'mdast';
import { parseMarkdown, clearParseCache } from './parse';

// Node position offsets must be DOCUMENT-ABSOLUTE, always.
//
// incremark parses its stable and pending regions as separate micromark
// documents, so the raw mdast `node.position.*.offset` values it exposes via
// `.ast` are relative to the REGION text, not the document (its `ParsedBlock`
// carries the corrected absolute offsets, the nodes don't). Consumers that map
// positions back into the source string — e.g. slicing a message into
// per-block rows — get garbage after incremental appends: blocks sliced
// mid-word at streaming chunk boundaries, duplicated content, cut code fences.
// parse.ts re-anchors every block's subtree from the ParsedBlock offsets; these
// tests pin that contract.

const offsets = (node: RootContent): [number, number] => {
  const start = node.position?.start?.offset;
  const end = node.position?.end?.offset;
  expect(start, `node ${node.type} has a start offset`).toBeTypeOf('number');
  expect(end, `node ${node.type} has an end offset`).toBeTypeOf('number');
  return [start!, end!];
};

/** Every top-level child's [start, end) must slice the source to the text
 *  given in `expected`. Trailing newlines are ignored in the comparison:
 *  incremark's builders are inconsistent about whether a block's END offset
 *  includes the line terminator (it varies with how the stable/pending region
 *  was cut), and no consumer depends on it — START offsets are the
 *  authoritative contract and are asserted exactly via expectReassembles. */
function expectSlices(root: Root, source: string, expected: string[]): void {
  const actual = root.children.map((c) => {
    const [start, end] = offsets(c);
    return source.slice(start, end).replace(/\n+$/, '');
  });
  expect(actual).toEqual(expected);
}

/** The per-block row-splitting contract: slicing the source at consecutive
 *  children START offsets (last block runs to end-of-source) must reassemble
 *  the source exactly — no overlap, no gap, no mid-word cuts. */
function expectReassembles(root: Root, source: string): void {
  const kids = root.children;
  const slices = kids.map((c, i) => {
    const [start] = offsets(c);
    const end = i + 1 < kids.length ? offsets(kids[i + 1]!)[0] : source.length;
    return source.slice(start, end);
  });
  expect(slices.join('')).toBe(source);
  // starts must be strictly increasing from the document head
  expect(offsets(kids[0]!)[0]).toBe(0);
}

beforeEach(() => {
  clearParseCache();
});

describe('parseMarkdown position offsets are document-absolute', () => {
  it('one-shot parse: the pending (unterminated) tail block is absolute', () => {
    const source = 'Deployed.\n\n```\ndeploy abc\n```\n\nRead-back confirmed:';
    const root = parseMarkdown(source);
    expectSlices(root, source, [
      'Deployed.',
      '```\ndeploy abc\n```',
      'Read-back confirmed:', // pending tail — was pending-buffer-relative (0..21)
    ]);
    expectReassembles(root, source);
  });

  it('incremental growth with a mid-word chunk boundary keeps offsets absolute', () => {
    // The exact real-world shape: a streaming turn whose chunk boundary lands
    // mid-word inside a paragraph ("Railway pr" + "oduction ...").
    const partial = 'Deployed.\n\nRailway pr';
    const full =
      partial +
      'oduction is now live with message:\n\n```\ndeploy abc\n```\n\nRead-back confirmed:';

    parseMarkdown(partial); // the live streaming row parses the prefix first
    const root = parseMarkdown(full); // then the persisted full text extends it

    expectSlices(root, full, [
      'Deployed.',
      'Railway production is now live with message:',
      '```\ndeploy abc\n```',
      'Read-back confirmed:',
    ]);
    expectReassembles(root, full);
  });

  it('many small appends (token streaming) never desync offsets', () => {
    const full =
      'First paragraph here.\n\nSecond paragraph grows slowly across many chunks.\n\n- item one\n- item two\n\nlast pending line';
    let root: Root | undefined;
    for (let end = 1; end <= full.length; end += 7) {
      root = parseMarkdown(full.slice(0, Math.min(end, full.length)));
    }
    root = parseMarkdown(full);
    expectSlices(root, full, [
      'First paragraph here.',
      'Second paragraph grows slowly across many chunks.',
      '- item one\n- item two',
      'last pending line',
    ]);
    expectReassembles(root, full);
  });

  it('re-anchors blocks whose inline children carry no positions', () => {
    // incremark's builders drop inline positions entirely (text/inlineCode/…
    // have `position: undefined`) — the block-level re-anchor must tolerate
    // that and still fix the top-level offsets.
    const partial = 'Deployed.\n\nsee `6ca160';
    const full = partial + 'c3...` never got instances';
    parseMarkdown(partial);
    const root = parseMarkdown(full);

    const para = root.children[1]!;
    expect(para.type).toBe('paragraph');
    const [start, end] = offsets(para);
    expect(full.slice(start, end)).toBe('see `6ca160c3...` never got instances');
    expectReassembles(root, full);
  });

  it('repeated parses and cache hits are idempotent (no double shift)', () => {
    const partial = 'Deployed.\n\nRailway pr';
    const full = partial + 'oduction is live.\n\ntail';
    parseMarkdown(partial);
    const first = parseMarkdown(full).children.map((c) => offsets(c));
    const second = parseMarkdown(full).children.map((c) => offsets(c)); // AST-cache hit
    expect(second).toEqual(first);

    // Incremental must agree with a one-shot parse on START offsets (end
    // offsets may differ by a trailing newline — an upstream builder quirk;
    // see expectSlices).
    clearParseCache();
    const fresh = parseMarkdown(full).children.map((c) => offsets(c));
    expect(fresh.map(([start]) => start)).toEqual(first.map(([start]) => start));
  });
});
