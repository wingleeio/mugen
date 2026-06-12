/**
 * A line-at-a-time scanner driven by {@link LanguageProfile} data. Each line is
 * tokenized independently given the state left by the previous line (inside a
 * block comment / multiline string), which makes the whole thing incremental:
 * when text is appended during streaming, only the changed tail re-tokenizes.
 *
 * Tokens carry no nesting and cover only the *coloured* spans — anything not
 * emitted paints in the block's plain text colour. This is deliberately a
 * heuristic lexer, not a parser: it must stay fast enough to run inside a
 * few-millisecond budget on every streaming tick.
 */
import type { TokenType } from './types';
import type { LanguageProfile } from './languages';

export interface Token {
  start: number;
  end: number;
  type: TokenType;
}

/** Scanner state carried across line boundaries. */
export interface LineState {
  mode: 'plain' | 'comment' | 'string';
  /** The delimiter that closes the carried comment/string. */
  close: string;
}

export const INITIAL_STATE: LineState = { mode: 'plain', close: '' };

const OPERATORS = '+-*/%=<>!&|^~?';
const PUNCTUATION = '()[]{};,.:';

function isDigit(c: string): boolean {
  return c >= '0' && c <= '9';
}

function isIdentStart(c: string, extra: string): boolean {
  return (
    (c >= 'a' && c <= 'z') ||
    (c >= 'A' && c <= 'Z') ||
    c === '_' ||
    c === '$' ||
    c > '\x7f' ||
    (extra.length > 0 && extra.includes(c))
  );
}

function isIdentPart(c: string, extra: string): boolean {
  return isIdentStart(c, extra) || isDigit(c);
}

/** Scan a string body from `from` to its closing delimiter (or end-of-line). */
function scanStringBody(line: string, from: number, close: string): { end: number; closed: boolean } {
  const n = line.length;
  let j = from;
  while (j < n) {
    if (line.charCodeAt(j) === 92 /* \ */) {
      j += 2;
      continue;
    }
    if (line.startsWith(close, j)) return { end: j + close.length, closed: true };
    j++;
  }
  return { end: n, closed: false };
}

/** Loose number scan: digits, radix prefixes, separators, exponents, suffixes. */
function scanNumber(line: string, start: number): number {
  const n = line.length;
  let j = start;
  while (j < n) {
    const c = line[j]!;
    if (
      isDigit(c) ||
      c === '.' ||
      c === '_' ||
      (c >= 'a' && c <= 'z') ||
      (c >= 'A' && c <= 'Z')
    ) {
      j++;
      continue;
    }
    const prev = line[j - 1];
    if ((c === '+' || c === '-') && (prev === 'e' || prev === 'E' || prev === 'p' || prev === 'P')) {
      j++;
      continue;
    }
    break;
  }
  return j;
}

function nextNonSpaceIdx(line: string, j: number): number {
  const n = line.length;
  while (j < n) {
    const c = line[j]!;
    if (c !== ' ' && c !== '\t') return j;
    j++;
  }
  return -1;
}

function classifyWord(
  line: string,
  start: number,
  end: number,
  prev: string,
  p: LanguageProfile,
): TokenType | null {
  const word = line.slice(start, end);
  const key = p.caseInsensitive === true ? word.toLowerCase() : word;
  if (p.keywords.has(key)) return 'keyword';
  if (p.constants.has(key)) return 'constant';
  if (p.tags === true && (prev === '<' || prev === '/')) return 'keyword';
  const ni = nextNonSpaceIdx(line, end);
  const next = ni < 0 ? '' : line[ni]!;
  if (next === '(') return 'function';
  if (p.eqProps === true && next === '=' && line[ni + 1] !== '=') return 'property';
  if (p.colonProps === true && line[end] === ':' && line[end + 1] !== ':') return 'property';
  if (prev === '.') return 'property';
  if (p.capitalTypes) {
    const c0 = line[start]!;
    if (c0 >= 'A' && c0 <= 'Z') return 'type';
  }
  return null;
}

/**
 * Tokenize one line given the state the previous line ended in. Returns the
 * coloured tokens (sorted, non-overlapping) and the state this line ends in.
 */
export function tokenizeLine(
  line: string,
  state: LineState,
  p: LanguageProfile,
): { tokens: Token[]; end: LineState } {
  const tokens: Token[] = [];
  const n = line.length;
  let i = 0;

  const push = (start: number, end: number, type: TokenType): void => {
    if (end > start) tokens.push({ start, end, type });
  };

  // Resume a construct carried over from the previous line.
  if (state.mode === 'comment') {
    const j = line.indexOf(state.close);
    if (j < 0) {
      push(0, n, 'comment');
      return { tokens, end: state };
    }
    i = j + state.close.length;
    push(0, i, 'comment');
  } else if (state.mode === 'string') {
    const r = scanStringBody(line, 0, state.close);
    push(0, r.end, 'string');
    if (!r.closed) return { tokens, end: state };
    i = r.end;
  }

  // Last significant character consumed — drives `.prop` / `<tag` heuristics.
  let prev = '';

  outer: while (i < n) {
    const ch = line[i]!;
    if (ch === ' ' || ch === '\t') {
      i++;
      continue;
    }

    for (const lc of p.lineComments) {
      if (line.startsWith(lc, i)) {
        push(i, n, 'comment');
        i = n;
        break outer;
      }
    }

    for (const bc of p.blockComments) {
      if (line.startsWith(bc[0], i)) {
        const j = line.indexOf(bc[1], i + bc[0].length);
        if (j < 0) {
          push(i, n, 'comment');
          return { tokens, end: { mode: 'comment', close: bc[1] } };
        }
        push(i, j + bc[1].length, 'comment');
        i = j + bc[1].length;
        prev = '';
        continue outer;
      }
    }

    for (const q of p.multilineQuotes) {
      if (line.startsWith(q, i)) {
        const r = scanStringBody(line, i + q.length, q);
        push(i, r.end, 'string');
        if (!r.closed) return { tokens, end: { mode: 'string', close: q } };
        i = r.end;
        prev = q[0]!;
        continue outer;
      }
    }

    if (p.quotes.includes(ch)) {
      const r = scanStringBody(line, i + 1, ch);
      push(i, r.end, p.stringKeys === true && line[r.end] === ':' ? 'property' : 'string');
      i = r.end;
      prev = ch;
      continue;
    }

    if (isDigit(ch) || (ch === '.' && i + 1 < n && isDigit(line[i + 1]!))) {
      const j = scanNumber(line, i);
      push(i, j, 'number');
      i = j;
      prev = '0';
      continue;
    }

    if (isIdentStart(ch, p.identExtra)) {
      let j = i + 1;
      while (j < n && isIdentPart(line[j]!, p.identExtra)) j++;
      const type = classifyWord(line, i, j, prev, p);
      if (type != null) push(i, j, type);
      i = j;
      prev = 'a';
      continue;
    }

    if (OPERATORS.includes(ch)) {
      let j = i + 1;
      while (j < n && OPERATORS.includes(line[j]!)) j++;
      push(i, j, 'operator');
      prev = line[j - 1]!;
      i = j;
      continue;
    }

    if (PUNCTUATION.includes(ch)) {
      push(i, i + 1, 'punctuation');
      prev = ch;
      i++;
      continue;
    }

    prev = ch;
    i++;
  }

  return { tokens, end: INITIAL_STATE };
}
