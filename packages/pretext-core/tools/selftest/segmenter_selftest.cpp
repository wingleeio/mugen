// Self-test for the segmenter port (grapheme.cpp / word.cpp).
//
// Expectations were produced by running the TS sources directly on Node
// (node --experimental-strip-types) against
// packages/pretext-native/src/segmenter/{grapheme,word}.ts.
// All non-ASCII is written as explicit \u/\U escapes so precomposed vs
// decomposed forms are unambiguous in the source. Build & run:
//   clang++ -std=c++20 -Ipackages/pretext-core/cpp \
//     packages/pretext-core/cpp/pretext/segmenter/*.cpp \
//     packages/pretext-core/tools/selftest/segmenter_selftest.cpp \
//     -o /tmp/seg_selftest && /tmp/seg_selftest

#include <cstdio>
#include <string>
#include <vector>

#include "pretext/segmenter/grapheme.hpp"
#include "pretext/segmenter/word.hpp"

using pretext::seg::countGraphemes;
using pretext::seg::iterateGraphemes;
using pretext::seg::iterateWords;
using pretext::seg::splitGraphemes;

static int failures = 0;
static int checks = 0;

static std::string toUtf8(const std::u16string& s) {
  // Debug-print helper only (escapes lone surrogates).
  std::string out;
  for (size_t i = 0; i < s.size();) {
    char32_t cp = pretext::codePointAt(s, i);
    i += pretext::codePointLen(cp);
    if (cp >= 0xD800 && cp <= 0xDFFF) {
      char buf[16];
      std::snprintf(buf, sizeof(buf), "\\u%04X", static_cast<unsigned>(cp));
      out += buf;
      continue;
    }
    if (cp < 0x80) {
      out += static_cast<char>(cp);
    } else if (cp < 0x800) {
      out += static_cast<char>(0xC0 | (cp >> 6));
      out += static_cast<char>(0x80 | (cp & 0x3F));
    } else if (cp < 0x10000) {
      out += static_cast<char>(0xE0 | (cp >> 12));
      out += static_cast<char>(0x80 | ((cp >> 6) & 0x3F));
      out += static_cast<char>(0x80 | (cp & 0x3F));
    } else {
      out += static_cast<char>(0xF0 | (cp >> 18));
      out += static_cast<char>(0x80 | ((cp >> 12) & 0x3F));
      out += static_cast<char>(0x80 | ((cp >> 6) & 0x3F));
      out += static_cast<char>(0x80 | (cp & 0x3F));
    }
  }
  return out;
}

static void expectGraphemes(const char* name, const std::u16string& text,
                            const std::vector<std::u16string>& expected) {
  ++checks;
  const auto got = splitGraphemes(text);
  bool ok = got == expected;
  // splitGraphemes and iterateGraphemes must agree (same boundary logic),
  // and iterateGraphemes indices must be the running UTF-16 offsets.
  const auto iter = iterateGraphemes(text);
  if (ok && iter.size() == got.size()) {
    int32_t idx = 0;
    for (size_t k = 0; k < iter.size(); ++k) {
      if (iter[k].segment != got[k] || iter[k].index != idx) { ok = false; break; }
      idx += static_cast<int32_t>(got[k].size());
    }
  } else {
    ok = false;
  }
  if (countGraphemes(text) != static_cast<int32_t>(expected.size())) ok = false;
  if (!ok) {
    ++failures;
    std::printf("FAIL %s: got %zu segments:", name, got.size());
    for (const auto& s : got) std::printf(" [%s](%zu)", toUtf8(s).c_str(), s.size());
    std::printf(" count=%d\n", countGraphemes(text));
  } else {
    std::printf("ok   %s\n", name);
  }
}

struct WS {
  std::u16string segment;
  int32_t index;
  bool isWordLike;
};

static void expectWords(const char* name, const std::u16string& text, const std::vector<WS>& expected) {
  ++checks;
  const auto got = iterateWords(text);
  bool ok = got.size() == expected.size();
  if (ok) {
    for (size_t k = 0; k < got.size(); ++k) {
      if (got[k].segment != expected[k].segment || got[k].index != expected[k].index ||
          got[k].isWordLike != expected[k].isWordLike) {
        ok = false;
        break;
      }
    }
  }
  if (!ok) {
    ++failures;
    std::printf("FAIL %s: got %zu segments:", name, got.size());
    for (const auto& s : got)
      std::printf(" [%s]@%d%s", toUtf8(s.segment).c_str(), s.index, s.isWordLike ? "*" : "");
    std::printf("\n");
  } else {
    std::printf("ok   %s\n", name);
  }
}

int main() {
  // --- graphemes ---

  // ZWJ family \U0001F468\u200D\U0001F469\u200D\U0001F467\u200D\U0001F466: MAN ZWJ WOMAN ZWJ GIRL ZWJ BOY is ONE cluster (GB11).
  const std::u16string family = u"\U0001F468\u200D\U0001F469\u200D\U0001F467\u200D\U0001F466";
  expectGraphemes("grapheme: ZWJ family", family, {family});

  // Flags \U0001F1FA\U0001F1F8: RIs pair up (GB12/13); two flags are two clusters...
  const std::u16string flagUS = u"\U0001F1FA\U0001F1F8";
  expectGraphemes("grapheme: two US flags", flagUS + flagUS, {flagUS, flagUS});
  // ...and an odd third RI stands alone.
  expectGraphemes("grapheme: RI triple", flagUS + u"\U0001F1FA", {flagUS, u"\U0001F1FA"});

  // Skin tone \U0001F44D\U0001F3FD: the modifier is Extend (GB9) \u2014 one cluster.
  const std::u16string thumb = u"\U0001F44D\U0001F3FD";
  expectGraphemes("grapheme: skin tone", thumb, {thumb});

  // Combining mark stays on its base: "e" + U+0301 + "x".
  expectGraphemes("grapheme: combining acute", u"e\u0301x", {u"e\u0301", u"x"});

  // VS16 emoji presentation \u2764\uFE0F: U+2764 U+FE0F is one cluster (FE0F is Extend).
  expectGraphemes("grapheme: heart VS16", u"\u2764\uFE0F", {u"\u2764\uFE0F"});

  // CRLF is one cluster (GB3), and controls break from neighbors (GB4/GB5).
  expectGraphemes("grapheme: CRLF", u"a\r\nb", {u"a", u"\r\n", u"b"});

  // ZWSP is CONTROL, so it separates.
  expectGraphemes("grapheme: ZWSP", u"a\u200Bb", {u"a", u"\u200B", u"b"});

  // Decomposed Hangul jamo L+V+T compose (GB6/GB7/GB8): one cluster \uAC01.
  expectGraphemes("grapheme: jamo LVT", u"\u1100\u1161\u11A8", {u"\u1100\u1161\u11A8"});

  // Precomposed syllables \uD55C\uAE00 are each their own cluster.
  expectGraphemes("grapheme: hangul syllables", u"\uD55C\uAE00", {u"\uD55C", u"\uAE00"});

  // Lone surrogate is its own 1-unit cluster (JS codePointAt semantics).
  expectGraphemes("grapheme: lone surrogate", std::u16string(1, char16_t(0xD83D)),
                  {std::u16string(1, char16_t(0xD83D))});

  expectGraphemes("grapheme: ascii", u"abc", {u"a", u"b", u"c"});
  expectGraphemes("grapheme: empty", u"", {});

  // --- words ---

  // MidLetter apostrophes glue when sandwiched by letters.
  expectWords("word: don't", u"don't", {{u"don't", 0, true}});
  expectWords("word: don\\u2019t", u"don\u2019t", {{u"don\u2019t", 0, true}});
  // Trailing apostrophe is NOT swallowed.
  expectWords("word: don'", u"don'", {{u"don", 0, true}, {u"'", 3, false}});

  // MidNum: decimal point and thousands separator glue between digits.
  expectWords("word: 3.5", u"3.5", {{u"3.5", 0, true}});
  expectWords("word: 1,000", u"1,000", {{u"1,000", 0, true}});
  // '.' between digit and letter does not glue.
  expectWords("word: 3.x", u"3.x", {{u"3", 0, true}, {u".", 1, false}, {u"x", 2, true}});

  expectWords("word: hello world", u"hello world",
              {{u"hello", 0, true}, {u" ", 5, false}, {u"world", 6, true}});

  // CJK \u4F60\u597D\u3042: one code point per segment, word-like.
  expectWords("word: CJK per char", u"\u4F60\u597D\u3042",
              {{u"\u4F60", 0, true}, {u"\u597D", 1, true}, {u"\u3042", 2, true}});

  // Connector punctuation joins runs.
  expectWords("word: snake_case", u"snake_case", {{u"snake_case", 0, true}});

  // CRLF is one non-word segment (WB3).
  expectWords("word: CRLF", u"a\r\nb", {{u"a", 0, true}, {u"\r\n", 1, false}, {u"b", 3, true}});

  // Emoji cluster stays atomic as a single non-word segment.
  expectWords("word: emoji cluster", u"hi " + family + u"!",
              {{u"hi", 0, true}, {u" ", 2, false}, {family, 3, false}, {u"!", 14, false}});

  // Whitespace runs merge (space + NBSP here).
  expectWords("word: whitespace run", u"a \u00A0b",
              {{u"a", 0, true}, {u" \u00A0", 1, false}, {u"b", 3, true}});

  // Combining marks ride along inside letter runs: "e\u0301x te\u0301".
  expectWords("word: marks in runs", u"e\u0301x te\u0301",
              {{u"e\u0301x", 0, true}, {u" ", 3, false}, {u"te\u0301", 4, true}});

  // caf\u00E9 (precomposed U+00E9) / \u5BFF\u53F8 / abc123.
  expectWords("word: mixed", u"caf\u00E9 \u5BFF\u53F8 abc123",
              {{u"caf\u00E9", 0, true},
               {u" ", 4, false},
               {u"\u5BFF", 5, true},
               {u"\u53F8", 6, true},
               {u" ", 7, false},
               {u"abc123", 8, true}});

  std::printf("%d/%d checks passed\n", checks - failures, checks);
  return failures == 0 ? 0 : 1;
}
