import { describe, it, expect, vi, beforeEach } from 'vitest';

// Wrap the real parser factory so we can count how many parsers get created —
// the observable signal that growth is handled incrementally (one parser) vs
// re-parsed from scratch (a new parser each time).
vi.mock('@incremark/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@incremark/core')>();
  return { ...actual, createIncremarkParser: vi.fn(actual.createIncremarkParser) };
});

import { createIncremarkParser } from '@incremark/core';
import { parseMarkdown, clearParseCache } from './parse';

const parsersCreated = () => vi.mocked(createIncremarkParser).mock.calls.length;

function stripPos<T>(node: T): T {
  return JSON.parse(JSON.stringify(node, (k, v) => (k === 'position' ? undefined : v)));
}

beforeEach(() => {
  clearParseCache();
  vi.mocked(createIncremarkParser).mockClear();
});

describe('parseMarkdown incremental behaviour', () => {
  it('reuses a single parser as the source grows', () => {
    parseMarkdown('# Title');
    parseMarkdown('# Title\n\nFirst para');
    parseMarkdown('# Title\n\nFirst para with more words');
    parseMarkdown('# Title\n\nFirst para with more words\n\n- a\n- b');
    expect(parsersCreated()).toBe(1);
  });

  it('serves an unchanged source from cache without touching a parser', () => {
    const a = parseMarkdown('# stable\n\nbody');
    const b = parseMarkdown('# stable\n\nbody');
    expect(a).toBe(b);
    expect(parsersCreated()).toBe(1);
  });

  it('growing the source yields the same AST as a one-shot parse', () => {
    const full =
      '# Title\n\nA **bold** line with `code` and [a](https://x).\n\n- one\n- two\n\n> quote\n\n```ts\nconst x = 1\n```';
    let incremental;
    for (const end of [6, 20, 45, 80, full.length]) incremental = parseMarkdown(full.slice(0, end));
    expect(parsersCreated()).toBe(1); // one parser drove the whole stream

    clearParseCache();
    const oneShot = parseMarkdown(full);
    expect(stripPos(incremental)).toEqual(stripPos(oneShot));
  });

  it('falls back to a fresh parser for a non-extending change', () => {
    parseMarkdown('# Apple');
    parseMarkdown('# Banana'); // neither string is a prefix of the other
    expect(parsersCreated()).toBe(2);
  });

  it('keeps a separate parser per independent (interleaved) stream', () => {
    parseMarkdown('Doc A:');
    parseMarkdown('Doc B:');
    parseMarkdown('Doc A: more'); // extends A
    parseMarkdown('Doc B: more'); // extends B
    expect(parsersCreated()).toBe(2);
  });
});
