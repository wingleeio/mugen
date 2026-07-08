// Port of packages/pretext-native/src/segmenter/word.ts
//
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

#include "word.hpp"

#include "../tables/unicode_tables.hpp"
#include "grapheme.hpp"

namespace pretext::seg {

namespace {

// Unicode property escapes: pretext itself already requires them (its emoji
// regexes use \p{Emoji_Presentation}), so leaning on them here adds no new
// engine requirement for Hermes.
// (TS regexes become generated-table lookups, PORTING.md rule 6:
//   LETTERISH_RE  = /[\p{L}\p{M}]/u
//   DIGIT_RE      = /\p{Nd}/u
//   WORD_CHAR_RE  = /[\p{L}\p{M}\p{Nd}\p{Pc}]/u)

int32_t charLen(char32_t cp) {
  return cp > 0xffff ? 2 : 1;
}

bool isWordChar(char32_t cp) {
  return tables::isLetter(cp) || tables::isMark(cp) || tables::isDecimalNumber(cp) ||
         tables::isConnectorPunctuation(cp);
}

bool isLetterish(char32_t cp) {
  return tables::isLetter(cp) || tables::isMark(cp);
}

bool isDigit(char32_t cp) {
  return tables::isDecimalNumber(cp);
}

// CJK scripts that must break per character (pretext expects this shape):
// Han, kana, Hangul syllables, halfwidth katakana.
bool isCJK(char32_t cp) {
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
bool isNewline(char32_t cp) {
  return cp == 0x0a || cp == 0x0b || cp == 0x0c || cp == 0x85 || cp == 0x2028 || cp == 0x2029;
}

// TS: /\s/.test(String.fromCodePoint(cp)) — the JS regex whitespace set.
bool isWhitespace(char32_t cp) {
  return tables::isWhitespace(cp);
}

// MidLetter/MidNum per UAX#29's common cases: apostrophes inside words
// ("don't", "don’t"), the middle dot, and decimal/thousands separators inside
// numbers ("3.5", "1,000"). Intl.Segmenter keeps all of these inside one
// word-like segment, and line breakers must too (breaking "3." / "5" apart
// would create bogus wrap points).
bool isMidLetter(char32_t cp) {
  return cp == 0x27 || cp == 0x2019 || cp == 0xb7;
}

bool isMidNum(char32_t cp) {
  return cp == 0x2e || cp == 0x2c;
}

}  // namespace

std::vector<WordSegment> iterateWords(const std::u16string& text) {
  std::vector<WordSegment> result;
  const int32_t len = static_cast<int32_t>(text.length());
  int32_t i = 0;
  while (i < len) {
    const int32_t start = i;
    const char32_t cp = codePointAt(text, static_cast<size_t>(i));

    // CRLF is one segment (WB3); other newlines stand alone so pretext sees
    // each hard break individually.
    if (cp == 0x0d) {
      // TS: text.charCodeAt(i + 1) === 0x0a (out-of-range charCodeAt is NaN,
      // never equal).
      i += (i + 1 < len && text[static_cast<size_t>(i) + 1] == 0x0a) ? 2 : 1;
      result.push_back({text.substr(static_cast<size_t>(start), static_cast<size_t>(i - start)), start, false});
      continue;
    }
    if (isNewline(cp)) {
      i += 1;
      result.push_back({text.substr(static_cast<size_t>(start), static_cast<size_t>(i - start)), start, false});
      continue;
    }

    // A run of non-newline whitespace is a single segment.
    if (isWhitespace(cp)) {
      i += charLen(cp);
      while (i < len) {
        const char32_t c = codePointAt(text, static_cast<size_t>(i));
        if (!isWhitespace(c) || isNewline(c) || c == 0x0d) break;
        i += charLen(c);
      }
      result.push_back({text.substr(static_cast<size_t>(start), static_cast<size_t>(i - start)), start, false});
      continue;
    }

    // CJK: one code point per segment, word-like (checked before the general
    // letter branch — Han/kana/Hangul are all \p{L}).
    if (isCJK(cp)) {
      i += charLen(cp);
      result.push_back({text.substr(static_cast<size_t>(start), static_cast<size_t>(i - start)), start, true});
      continue;
    }

    // Letter/number run: letters (with attached marks), digits, connector
    // punctuation, glued by MidLetter/MidNum when sandwiched.
    if (isWordChar(cp)) {
      char32_t lastCp = cp;
      i += charLen(cp);
      while (i < len) {
        const char32_t c = codePointAt(text, static_cast<size_t>(i));
        if (!isCJK(c) && isWordChar(c)) {
          lastCp = c;
          i += charLen(c);
          continue;
        }
        // A mid character only stays inside the run when BOTH neighbors
        // qualify — trailing "don'" or "3." must not swallow the punctuation.
        const int32_t nextIdx = i + charLen(c);
        // TS: next = nextIdx < len ? codePointAt(nextIdx) : -1
        const int64_t next =
            nextIdx < len ? static_cast<int64_t>(codePointAt(text, static_cast<size_t>(nextIdx))) : -1;
        const bool glueLetter = isMidLetter(c) && isLetterish(lastCp) && next >= 0 &&
                                !isCJK(static_cast<char32_t>(next)) && isLetterish(static_cast<char32_t>(next));
        const bool glueNum = isMidNum(c) && isDigit(lastCp) && next >= 0 && isDigit(static_cast<char32_t>(next));
        if (glueLetter || glueNum) {
          lastCp = static_cast<char32_t>(next);
          i = nextIdx + charLen(static_cast<char32_t>(next));
          continue;
        }
        break;
      }
      result.push_back({text.substr(static_cast<size_t>(start), static_cast<size_t>(i - start)), start, true});
      continue;
    }

    // Everything else (punctuation, symbols, emoji): one segment per grapheme
    // cluster, so multi-code-point emoji stay atomic.
    const int32_t end = nextGraphemeBoundary(text, i);
    result.push_back({text.substr(static_cast<size_t>(start), static_cast<size_t>(end - start)), start, false});
    i = end;
  }
  return result;
}

}  // namespace pretext::seg
