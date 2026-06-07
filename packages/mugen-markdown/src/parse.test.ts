import { describe, expect, it, beforeEach } from 'vitest';
import { parseMarkdown, clearParseCache } from './parse';
import type { Heading, Code, List, Table, Paragraph } from 'mdast';

beforeEach(() => clearParseCache());

describe('parseMarkdown', () => {
  it('parses block structure into an mdast Root', () => {
    const ast = parseMarkdown('# Title\n\nA paragraph.');
    expect(ast.type).toBe('root');
    expect(ast.children.map((c) => c.type)).toEqual(['heading', 'paragraph']);
    const h = ast.children[0] as Heading;
    expect(h.depth).toBe(1);
  });

  it('parses inline marks as phrasing children', () => {
    const ast = parseMarkdown('hello **bold** and `code`');
    const p = ast.children[0] as Paragraph;
    const types = p.children.map((c) => c.type);
    expect(types).toContain('strong');
    expect(types).toContain('inlineCode');
  });

  it('parses fenced code with its language and value', () => {
    const ast = parseMarkdown('```ts\nconst x = 1\n```');
    const code = ast.children[0] as Code;
    expect(code.type).toBe('code');
    expect(code.lang).toBe('ts');
    expect(code.value).toBe('const x = 1');
  });

  it('parses ordered and unordered lists', () => {
    const ul = parseMarkdown('- a\n- b').children[0] as List;
    expect(ul.type).toBe('list');
    expect(ul.ordered).toBeFalsy();
    expect(ul.children).toHaveLength(2);

    const ol = parseMarkdown('1. a\n2. b').children[0] as List;
    expect(ol.ordered).toBe(true);
  });

  it('parses GFM tables by default', () => {
    const ast = parseMarkdown('| a | b |\n|---|---|\n| 1 | 2 |');
    const table = ast.children[0] as Table;
    expect(table.type).toBe('table');
    expect(table.children).toHaveLength(2); // header + one row
  });

  it('parses GFM task list items with checked state', () => {
    const ul = parseMarkdown('- [x] done\n- [ ] todo').children[0] as List;
    expect(ul.children[0]!.checked).toBe(true);
    expect(ul.children[1]!.checked).toBe(false);
  });

  it('returns the same cached AST for identical input', () => {
    const a = parseMarkdown('# same');
    const b = parseMarkdown('# same');
    expect(a).toBe(b);
  });

  it('re-parses after the cache is cleared', () => {
    const a = parseMarkdown('# x');
    clearParseCache();
    const b = parseMarkdown('# x');
    expect(a).not.toBe(b);
    expect(b.children[0]!.type).toBe('heading');
  });
});
