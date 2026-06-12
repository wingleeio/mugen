import { describe, expect, it } from 'vitest';
import { profileFor } from './languages';
import { INITIAL_STATE, tokenizeLine, type LineState, type Token } from './tokenize';
import type { TokenType } from './types';

const ts = profileFor('ts')!;
const rust = profileFor('rust')!;

/** Tokenize a multi-line snippet, threading line state, and flatten to text+type. */
function lex(source: string, lang = 'ts'): { text: string; type: TokenType }[] {
  const p = profileFor(lang)!;
  let state: LineState = INITIAL_STATE;
  const out: { text: string; type: TokenType }[] = [];
  for (const line of source.split('\n')) {
    const r = tokenizeLine(line, state, p);
    state = r.end;
    for (const t of r.tokens) out.push({ text: line.slice(t.start, t.end), type: t.type });
  }
  return out;
}

function typesOf(tokens: { text: string; type: TokenType }[]): Map<string, TokenType> {
  return new Map(tokens.map((t) => [t.text, t.type]));
}

describe('tokenizeLine', () => {
  it('classifies a representative TypeScript line', () => {
    const t = typesOf(lex('const total = compute(items.length) + 42; // sum'));
    expect(t.get('const')).toBe('keyword');
    expect(t.get('compute')).toBe('function');
    expect(t.get('length')).toBe('property');
    expect(t.get('42')).toBe('number');
    expect(t.get('// sum')).toBe('comment');
    expect(t.get('+')).toBe('operator');
    expect(t.get(';')).toBe('punctuation');
    expect(t.has('total')).toBe(false); // plain identifiers are not emitted
  });

  it('keeps tokens sorted and non-overlapping', () => {
    const r = tokenizeLine('if (a.b === "x") { return fn(1); }', INITIAL_STATE, ts);
    let pos = 0;
    for (const tok of r.tokens) {
      expect(tok.start).toBeGreaterThanOrEqual(pos);
      expect(tok.end).toBeGreaterThan(tok.start);
      pos = tok.end;
    }
  });

  it('treats escaped quotes as string content', () => {
    const [tok] = lex(String.raw`"a\"b"`, 'json');
    expect(tok).toEqual({ text: String.raw`"a\"b"`, type: 'string' });
  });

  it('carries template literals across lines', () => {
    const tokens = lex('const s = `line one\nline two\nrest` + done(1);');
    expect(typesOf(tokens).get('`line one')).toBe('string');
    expect(typesOf(tokens).get('line two')).toBe('string');
    expect(typesOf(tokens).get('rest`')).toBe('string');
    expect(typesOf(tokens).get('done')).toBe('function');
  });

  it('carries block comments across lines and resumes after the close', () => {
    const tokens = lex('before(); /* one\ntwo\nthree */ after();');
    const t = typesOf(tokens);
    expect(t.get('/* one')).toBe('comment');
    expect(t.get('two')).toBe('comment');
    expect(t.get('three */')).toBe('comment');
    expect(t.get('before')).toBe('function');
    expect(t.get('after')).toBe('function');
  });

  it('carries python triple-quoted strings across lines', () => {
    const tokens = lex('def f():\n    """doc\n    string"""\n    return None', 'python');
    const t = typesOf(tokens);
    expect(t.get('def')).toBe('keyword');
    expect(t.get('f')).toBe('function');
    expect(t.get('"""doc')).toBe('string');
    expect(t.get('None')).toBe('constant');
  });

  it('distinguishes JSON keys from string values', () => {
    const t = typesOf(lex('{ "name": "mugen", "count": 3, "on": true }', 'json'));
    expect(t.get('"name"')).toBe('property');
    expect(t.get('"mugen"')).toBe('string');
    expect(t.get('"count"')).toBe('property');
    expect(t.get('3')).toBe('number');
    expect(t.get('true')).toBe('constant');
  });

  it('recognises HTML tags and attributes', () => {
    const t = typesOf(lex('<div class="row" data-id=1>', 'html'));
    expect(t.get('div')).toBe('keyword');
    expect(t.get('class')).toBe('property');
    expect(t.get('"row"')).toBe('string');
    expect(t.get('data-id')).toBe('property');
  });

  it('matches SQL keywords case-insensitively', () => {
    const t = typesOf(lex('SELECT id FROM users WHERE age > 21;', 'sql'));
    expect(t.get('SELECT')).toBe('keyword');
    expect(t.get('FROM')).toBe('keyword');
    expect(t.get('WHERE')).toBe('keyword');
    expect(t.get('21')).toBe('number');
  });

  it('does not treat rust lifetimes as strings', () => {
    const r = tokenizeLine("fn get<'a>(s: &'a str) -> &'a str {", INITIAL_STATE, rust);
    expect(r.end).toEqual(INITIAL_STATE);
    expect(r.tokens.some((t) => t.type === 'string')).toBe(false);
  });

  it('handles number forms', () => {
    const tokens = lex('a = [0xFF, 1_000, 1e-3, .5];');
    const nums = tokens.filter((t) => t.type === 'number').map((t) => t.text);
    expect(nums).toEqual(['0xFF', '1_000', '1e-3', '.5']);
  });

  it('is pure per (line, state): re-tokenizing an unchanged prefix is identical', () => {
    const line = 'const x = `open';
    const a = tokenizeLine(line, INITIAL_STATE, ts);
    const b = tokenizeLine(line, INITIAL_STATE, ts);
    expect(b.tokens).toEqual(a.tokens);
    expect(b.end).toEqual(a.end);
    // and the carried state is what the next line resumes from
    expect(a.end.mode).toBe('string');
    const next = tokenizeLine('still open` + 1', a.end, ts);
    expect(next.tokens[0]).toEqual({ start: 0, end: 11, type: 'string' } satisfies Token);
    expect(next.end).toEqual(INITIAL_STATE);
  });
});
