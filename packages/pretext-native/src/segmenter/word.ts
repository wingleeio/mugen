// Word-granularity segmentation, Intl-alike.
//
// pretext consumes word segments to find soft-wrap opportunities: contiguous
// letter/number runs stay together, whitespace and punctuation are their own
// segments, and CJK falls apart per character. That last point is why we
// don't need ICU's dictionary-based Chinese/Japanese/Thai segmentation:
// pretext re-splits CJK per character regardless (see its splitSegmentBy-
// BreakKind), so producing per-character CJK segments here is not a loss of
// fidelity for LAYOUT — it only differs from ICU for callers that wanted
// linguistic words, which pretext is not.
//
// Deliberate simplifications vs UAX#29, all layout-neutral for pretext:
// - Thai/Lao/Khmer letters segment as one run (no dictionary) instead of
//   ICU's dictionary words; pretext's own line breaker handles SE Asian
//   scripts via UAX#14 classes.
// - Prepend, ExtendNumLet edge cases beyond '_' are skipped.

import { nextGraphemeBoundary } from './grapheme.js';

export type WordSegment = {
  segment: string;
  index: number;
  isWordLike: boolean;
};

// Unicode property escapes: pretext itself already requires them (its emoji
// regexes use \p{Emoji_Presentation}), so leaning on them here adds no new
// engine requirement for Hermes.
const LETTERISH_RE = /[\p{L}\p{M}]/u;
const DIGIT_RE = /\p{Nd}/u;
const WORD_CHAR_RE = /[\p{L}\p{M}\p{Nd}\p{Pc}]/u;

function charLen(cp: number): number {
  return cp > 0xffff ? 2 : 1;
}

function isWordChar(cp: number): boolean {
  return WORD_CHAR_RE.test(String.fromCodePoint(cp));
}

function isLetterish(cp: number): boolean {
  return LETTERISH_RE.test(String.fromCodePoint(cp));
}

function isDigit(cp: number): boolean {
  return DIGIT_RE.test(String.fromCodePoint(cp));
}

// CJK scripts that must break per character (pretext expects this shape):
// Han, kana, Hangul syllables, halfwidth katakana.
function isCJK(cp: number): boolean {
  return (
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0x3040 && cp <= 0x309f) ||
    (cp >= 0x30a0 && cp <= 0x30ff) ||
    (cp >= 0x31f0 && cp <= 0x31ff) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xff66 && cp <= 0xff9f)
  );
}

// UAX#29 "Newline" values (CR handled separately for the CRLF pairing).
function isNewline(cp: number): boolean {
  return cp === 0x0a || cp === 0x0b || cp === 0x0c || cp === 0x85 || cp === 0x2028 || cp === 0x2029;
}

function isWhitespace(cp: number): boolean {
  return /\s/.test(String.fromCodePoint(cp));
}

// MidLetter/MidNum per UAX#29's common cases: apostrophes inside words
// ("don't", "don’t"), the middle dot, and decimal/thousands separators inside
// numbers ("3.5", "1,000"). Intl.Segmenter keeps all of these inside one
// word-like segment, and line breakers must too (breaking "3." / "5" apart
// would create bogus wrap points).
function isMidLetter(cp: number): boolean {
  return cp === 0x27 || cp === 0x2019 || cp === 0xb7;
}

function isMidNum(cp: number): boolean {
  return cp === 0x2e || cp === 0x2c;
}

export function* iterateWords(text: string): Generator<WordSegment> {
  const len = text.length;
  let i = 0;
  while (i < len) {
    const start = i;
    const cp = text.codePointAt(i)!;

    // CRLF is one segment (WB3); other newlines stand alone so pretext sees
    // each hard break individually.
    if (cp === 0x0d) {
      i += text.charCodeAt(i + 1) === 0x0a ? 2 : 1;
      yield { segment: text.slice(start, i), index: start, isWordLike: false };
      continue;
    }
    if (isNewline(cp)) {
      i += 1;
      yield { segment: text.slice(start, i), index: start, isWordLike: false };
      continue;
    }

    // A run of non-newline whitespace is a single segment.
    if (isWhitespace(cp)) {
      i += charLen(cp);
      while (i < len) {
        const c = text.codePointAt(i)!;
        if (!isWhitespace(c) || isNewline(c) || c === 0x0d) break;
        i += charLen(c);
      }
      yield { segment: text.slice(start, i), index: start, isWordLike: false };
      continue;
    }

    // CJK: one code point per segment, word-like (checked before the general
    // letter branch — Han/kana/Hangul are all \p{L}).
    if (isCJK(cp)) {
      i += charLen(cp);
      yield { segment: text.slice(start, i), index: start, isWordLike: true };
      continue;
    }

    // Letter/number run: letters (with attached marks), digits, connector
    // punctuation, glued by MidLetter/MidNum when sandwiched.
    if (isWordChar(cp)) {
      let lastCp = cp;
      i += charLen(cp);
      while (i < len) {
        const c = text.codePointAt(i)!;
        if (!isCJK(c) && isWordChar(c)) {
          lastCp = c;
          i += charLen(c);
          continue;
        }
        // A mid character only stays inside the run when BOTH neighbors
        // qualify — trailing "don'" or "3." must not swallow the punctuation.
        const nextIdx = i + charLen(c);
        const next = nextIdx < len ? text.codePointAt(nextIdx)! : -1;
        const glueLetter = isMidLetter(c) && isLetterish(lastCp) && next >= 0 && !isCJK(next) && isLetterish(next);
        const glueNum = isMidNum(c) && isDigit(lastCp) && next >= 0 && isDigit(next);
        if (glueLetter || glueNum) {
          lastCp = next;
          i = nextIdx + charLen(next);
          continue;
        }
        break;
      }
      yield { segment: text.slice(start, i), index: start, isWordLike: true };
      continue;
    }

    // Everything else (punctuation, symbols, emoji): one segment per grapheme
    // cluster, so multi-code-point emoji stay atomic.
    const end = nextGraphemeBoundary(text, i);
    yield { segment: text.slice(start, end), index: start, isWordLike: false };
    i = end;
  }
}
