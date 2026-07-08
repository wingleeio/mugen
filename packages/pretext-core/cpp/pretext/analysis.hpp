// Port of @chenglou/pretext@0.0.8 src/analysis.ts
// Whitespace normalization, word segmentation → merged segments with break
// kinds, kinsoku/punctuation classes, hard-break chunking.
#pragma once

#include <string>

#include "types.hpp"

namespace pretext {

// AnalysisProfile is the {carryCJKAfterClosingQuote, breakKeepAllAfterPunctuation}
// subset of EngineProfile — pass kNativeEngineProfile-derived values.
struct AnalysisProfile {
  bool carryCJKAfterClosingQuote = false;
  bool breakKeepAllAfterPunctuation = true;
};

std::u16string normalizeWhitespaceNormal(const std::u16string& text);
std::u16string normalizeWhitespacePreWrap(const std::u16string& text);

void clearAnalysisCaches();

// isCJK(s): true if any code point in s is CJK (port the exact ranges).
bool isCJK(const std::u16string& s);
bool isCJKCodePoint(char32_t cp); // helper for single-cp callers

bool canContinueKeepAllTextRun(const std::u16string& previousText, bool breakAfterPunctuation);
bool endsWithClosingQuote(const std::u16string& text);
bool isNumericRunSegment(const std::u16string& text);

// TS: kinsokuStart/kinsokuEnd/leftStickyPunctuation are Set<string> of
// single-grapheme strings. Port as membership tests over the same literals.
bool isKinsokuStart(const std::u16string& grapheme);
bool isKinsokuEnd(const std::u16string& grapheme);
bool isLeftStickyPunctuation(const std::u16string& grapheme);

TextAnalysis analyzeText(
    const std::u16string& text,
    const AnalysisProfile& profile,
    WhiteSpaceMode whiteSpace = WhiteSpaceMode::Normal,
    WordBreakMode wordBreak = WordBreakMode::Normal);

}  // namespace pretext
