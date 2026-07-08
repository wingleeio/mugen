// Port of @chenglou/pretext@0.0.8 src/analysis.ts
// Whitespace normalization, word segmentation → merged segments with break
// kinds, kinsoku/punctuation classes, hard-break chunking.
//
// Mirrors the TS module 1:1 (PORTING.md). Native-only deviations:
//   - Intl.Segmenter(word) → pretext::seg::iterateWords (pretext-native's
//     PretextSegmenter is a straight passthrough for word granularity).
//   - locale is ignored (setAnalysisLocale dropped; the segmenter is
//     locale-independent on native).
//   - \p{...} regexes → tables:: lookups; literal char-class regexes are
//     hand-rolled scanners with identical semantics.

#include "analysis.hpp"

#include <optional>
#include <utility>
#include <vector>

#include "segmenter/word.hpp"
#include "tables/unicode_tables.hpp"

namespace pretext {

namespace {

// --- code-point iteration helpers (JS `for..of` / Array.from iterate code
// points, yielding 1-2 code-unit substrings) ---

// Split into per-code-point substrings, like Array.from(text).
std::vector<std::u16string> codePoints(const std::u16string& s) {
  std::vector<std::u16string> out;
  size_t i = 0, n = s.size();
  while (i < n) {
    char32_t cp = codePointAt(s, i);
    size_t l = codePointLen(cp);
    out.push_back(s.substr(i, l));
    i += l;
  }
  return out;
}

// re.test for a single-char-class regex: true iff any code point matches.
bool anyCodePoint(const std::u16string& s, bool (*pred)(char32_t)) {
  size_t i = 0, n = s.size();
  while (i < n) {
    char32_t cp = codePointAt(s, i);
    if (pred(cp)) return true;
    i += codePointLen(cp);
  }
  return false;
}

// /^\p{M}+$/u : non-empty and every code point is a Mark.
bool isAllMarksNonEmpty(const std::u16string& s) {
  if (s.empty()) return false;
  size_t i = 0, n = s.size();
  while (i < n) {
    char32_t cp = codePointAt(s, i);
    if (!tables::isMark(cp)) return false;
    i += codePointLen(cp);
  }
  return true;
}

// \p{M} / \p{Script=Arabic} / \p{Nd} / [\p{P}\p{S}\p{Co}] / \p{Emoji_Presentation}
bool reCombiningMark(const std::u16string& s) { return anyCodePoint(s, tables::isMark); }
bool reArabicScript(const std::u16string& s) { return anyCodePoint(s, tables::isScriptArabic); }
bool reDecimalDigit(const std::u16string& s) { return anyCodePoint(s, tables::isDecimalNumber); }
bool reWordInternalSymbol(const std::u16string& s) { return anyCodePoint(s, tables::isWordInternalSymbol); }
bool reEmojiPresentation(const std::u16string& s) { return anyCodePoint(s, tables::isEmojiPresentation); }

// String helpers mirroring JS String methods.
bool startsWith(const std::u16string& s, const std::u16string& p) {
  return s.size() >= p.size() && s.compare(0, p.size(), p) == 0;
}
bool includes(const std::u16string& s, const std::u16string& p) {
  return s.find(p) != std::u16string::npos;
}
// JS String.prototype.split with a single-char separator.
std::vector<std::u16string> splitChar(const std::u16string& s, char16_t sep) {
  std::vector<std::u16string> out;
  std::u16string cur;
  for (char16_t c : s) {
    if (c == sep) {
      out.push_back(cur);
      cur.clear();
    } else {
      cur.push_back(c);
    }
  }
  out.push_back(cur);
  return out;
}
std::u16string repeat(const std::u16string& s, int32_t n) {
  std::u16string out;
  for (int32_t i = 0; i < n; i++) out += s;
  return out;
}

// --- literal Set<string> membership (single-grapheme code points) ---
// TS Sets contain single BMP code units; membership over a code-point string
// reduces to membership of its code point.

bool inKinsokuStart(char32_t cp) {
  switch (cp) {
    case 0xFF0C: case 0xFF0E: case 0xFF01: case 0xFF1A: case 0xFF1B: case 0xFF1F:
    case 0x3001: case 0x3002: case 0x30FB: case 0xFF09: case 0x3015: case 0x3009:
    case 0x300B: case 0x300D: case 0x300F: case 0x3011: case 0x3017: case 0x3019:
    case 0x301B: case 0x30FC: case 0x3005: case 0x303B: case 0x309D: case 0x309E:
    case 0x30FD: case 0x30FE:
      return true;
    default:
      return false;
  }
}

bool inKinsokuEnd(char32_t cp) {
  switch (cp) {
    case 0x22:
    case 0x28: case 0x5B: case 0x7B:
    case 0xA1: case 0xBF:
    case 0x201C: case 0x2018: case 0x201A: case 0x201E: case 0xAB: case 0x2039:
    case 0x2E18:
    case 0xFF08:
    case 0x3014:
    case 0x3008:
    case 0x300A:
    case 0x300C:
    case 0x300E:
    case 0x3010:
    case 0x3016:
    case 0x3018:
    case 0x301A:
      return true;
    default:
      return false;
  }
}

bool inForwardStickyGlue(char32_t cp) {
  return cp == 0x27 || cp == 0x2019;
}

bool inLeftStickyPunctuation(char32_t cp) {
  switch (cp) {
    case 0x2E: case 0x2C: case 0x21: case 0x3F: case 0x3A: case 0x3B:
    case 0x060C:
    case 0x061B:
    case 0x061F:
    case 0x0964:
    case 0x0965:
    case 0x104A:
    case 0x104B:
    case 0x104C:
    case 0x104D:
    case 0x104F:
    case 0x29: case 0x5D: case 0x7D:
    case 0x25:
    case 0x22:
    case 0x201D: case 0x2019: case 0xBB: case 0x203A:
    case 0x2026:
      return true;
    default:
      return false;
  }
}

bool inArabicNoSpaceTrailingPunctuation(char32_t cp) {
  return cp == 0x3A || cp == 0x2E || cp == 0x060C || cp == 0x061B;
}

bool inMyanmarMedialGlue(char32_t cp) { return cp == 0x104F; }

bool inClosingQuoteChars(char32_t cp) {
  switch (cp) {
    case 0x201D: case 0x2019: case 0xBB: case 0x203A:
    case 0x300D:
    case 0x300F:
    case 0x3011:
    case 0x300B:
    case 0x3009:
    case 0x3015:
    case 0xFF09:
      return true;
    default:
      return false;
  }
}

bool inKeepAllGlueChars(char32_t cp) {
  return cp == 0x00A0 || cp == 0x202F || cp == 0x2060 || cp == 0xFEFF;
}

bool inKeepAllDashBreakChars(char32_t cp) {
  return cp == 0x2D || cp == 0x2010 || cp == 0x2013 || cp == 0x2014;
}

bool inNumericJoinerChars(char32_t cp) {
  switch (cp) {
    case 0x3A: case 0x2D: case 0x2F: case 0xD7: case 0x2C: case 0x2E: case 0x2B:
    case 0x2013:
    case 0x2014:
      return true;
    default:
      return false;
  }
}

bool inNoSpaceWordBreakAfterChars(char32_t cp) {
  switch (cp) {
    case 0x3F:
    case 0x058A:
    case 0x2D:
    case 0x2010:
    case 0x2012:
    case 0x2013:
    case 0x2014:
    case 0x2026:
    case 0x203C:
    case 0x203D:
    case 0x2049:
      return true;
    default:
      return false;
  }
}

// Membership of a code-point string (from getLastCodePoint / for..of).
char32_t cpOf(const std::u16string& ch) { return codePointAt(ch, 0); }

// --- internal MergedSegmentation shape ---

struct MergedSegmentation {
  int32_t len = 0;
  std::vector<std::u16string> texts;
  std::vector<bool> isWordLike;
  std::vector<SegmentBreakKind> kinds;
  std::vector<int32_t> starts;
};

struct SegmentationPiece {
  std::u16string text;
  bool isWordLike = false;
  SegmentBreakKind kind = SegmentBreakKind::Text;
  int32_t start = 0;
};

struct WhiteSpaceProfile {
  WhiteSpaceMode mode = WhiteSpaceMode::Normal;
  bool preserveOrdinarySpaces = false;
  bool preserveHardBreaks = false;
};

WhiteSpaceProfile getWhiteSpaceProfile(WhiteSpaceMode whiteSpace) {
  WhiteSpaceMode mode = whiteSpace;
  if (mode == WhiteSpaceMode::PreWrap) {
    return {mode, /*preserveOrdinarySpaces=*/true, /*preserveHardBreaks=*/true};
  }
  return {mode, /*preserveOrdinarySpaces=*/false, /*preserveHardBreaks=*/false};
}

// --- whitespace normalization scanners ---

bool isCollapsibleWhitespace(char16_t c) {
  return c == 0x20 || c == 0x09 || c == 0x0A || c == 0x0D || c == 0x0C;
}

// needsWhitespaceNormalizationRe = /[\t\n\r\f]| {2,}|^ | $/
bool needsWhitespaceNormalization(const std::u16string& text) {
  size_t n = text.size();
  if (n > 0 && text[0] == 0x20) return true;          // ^ (leading space)
  if (n > 0 && text[n - 1] == 0x20) return true;      // $ (trailing space)
  for (size_t i = 0; i < n; i++) {
    char16_t c = text[i];
    if (c == 0x09 || c == 0x0A || c == 0x0D || c == 0x0C) return true;  // [\t\n\r\f]
    if (c == 0x20 && i + 1 < n && text[i + 1] == 0x20) return true;     // {2,}
  }
  return false;
}

// text.replace(/[ \t\n\r\f]+/g, ' ')
std::u16string collapseWhitespaceRuns(const std::u16string& text) {
  std::u16string result;
  size_t i = 0, n = text.size();
  while (i < n) {
    char16_t c = text[i];
    if (isCollapsibleWhitespace(c)) {
      result.push_back(u' ');
      i++;
      while (i < n && isCollapsibleWhitespace(text[i])) i++;
    } else {
      result.push_back(c);
      i++;
    }
  }
  return result;
}

}  // namespace

std::u16string normalizeWhitespaceNormal(const std::u16string& text) {
  if (!needsWhitespaceNormalization(text)) return text;

  std::u16string normalized = collapseWhitespaceRuns(text);
  if (!normalized.empty() && normalized[0] == 0x20) {
    normalized = normalized.substr(1);
  }
  if (normalized.size() > 0 && normalized[normalized.size() - 1] == 0x20) {
    normalized = normalized.substr(0, normalized.size() - 1);
  }
  return normalized;
}

std::u16string normalizeWhitespacePreWrap(const std::u16string& text) {
  // if (!/[\r\f]/.test(text)) return text
  bool hasCrOrFf = false;
  for (char16_t c : text) {
    if (c == 0x0D || c == 0x0C) {
      hasCrOrFf = true;
      break;
    }
  }
  if (!hasCrOrFf) return text;

  // .replace(/\r\n/g, '\n')
  std::u16string step1;
  size_t n = text.size();
  for (size_t i = 0; i < n; i++) {
    if (text[i] == 0x0D && i + 1 < n && text[i + 1] == 0x0A) {
      step1.push_back(u'\n');
      i++;
    } else {
      step1.push_back(text[i]);
    }
  }
  // .replace(/[\r\f]/g, '\n')
  std::u16string step2;
  step2.reserve(step1.size());
  for (char16_t c : step1) {
    step2.push_back((c == 0x0D || c == 0x0C) ? u'\n' : c);
  }
  return step2;
}

void clearAnalysisCaches() {
  // The TS resets a shared Intl.Segmenter here; the native word segmenter is
  // stateless (pretext::seg::iterateWords), and this module keeps no memo
  // maps, so there is nothing to clear.
}

namespace {

// arabicScriptRe.test(text)
bool containsArabicScript(const std::u16string& text) { return reArabicScript(text); }

}  // namespace

bool isCJKCodePoint(char32_t codePoint) {
  return (
    (codePoint >= 0x4E00 && codePoint <= 0x9FFF) ||
    (codePoint >= 0x3400 && codePoint <= 0x4DBF) ||
    (codePoint >= 0x20000 && codePoint <= 0x2A6DF) ||
    (codePoint >= 0x2A700 && codePoint <= 0x2B73F) ||
    (codePoint >= 0x2B740 && codePoint <= 0x2B81F) ||
    (codePoint >= 0x2B820 && codePoint <= 0x2CEAF) ||
    (codePoint >= 0x2CEB0 && codePoint <= 0x2EBEF) ||
    (codePoint >= 0x2EBF0 && codePoint <= 0x2EE5D) ||
    (codePoint >= 0x2F800 && codePoint <= 0x2FA1F) ||
    (codePoint >= 0x30000 && codePoint <= 0x3134F) ||
    (codePoint >= 0x31350 && codePoint <= 0x323AF) ||
    (codePoint >= 0x323B0 && codePoint <= 0x33479) ||
    (codePoint >= 0xF900 && codePoint <= 0xFAFF) ||
    (codePoint >= 0x3000 && codePoint <= 0x303F) ||
    (codePoint >= 0x3040 && codePoint <= 0x309F) ||
    (codePoint >= 0x30A0 && codePoint <= 0x30FF) ||
    (codePoint >= 0x3130 && codePoint <= 0x318F) ||
    (codePoint >= 0xAC00 && codePoint <= 0xD7AF) ||
    (codePoint >= 0xFF00 && codePoint <= 0xFFEF)
  );
}

bool isCJK(const std::u16string& s) {
  for (size_t i = 0; i < s.size(); i++) {
    char16_t first = s[i];
    if (first < 0x3000) continue;

    if (first >= 0xD800 && first <= 0xDBFF && i + 1 < s.size()) {
      char16_t second = s[i + 1];
      if (second >= 0xDC00 && second <= 0xDFFF) {
        char32_t codePoint = ((char32_t(first) - 0xD800) << 10) + (second - 0xDC00) + 0x10000;
        if (isCJKCodePoint(codePoint)) return true;
        i++;
        continue;
      }
    }

    if (isCJKCodePoint(first)) return true;
  }
  return false;
}

namespace {

// --- previous-code-point / significant-code-point scanners ---

int32_t previousCodePointStart(const std::u16string& text, int32_t end) {
  int32_t last = end - 1;
  if (last <= 0) return last > 0 ? last : 0;  // Math.max(last, 0)

  char16_t lastCodeUnit = text[last];
  if (lastCodeUnit < 0xDC00 || lastCodeUnit > 0xDFFF) return last;

  int32_t maybeHigh = last - 1;
  if (maybeHigh < 0) return last;

  char16_t highCodeUnit = text[maybeHigh];
  return (highCodeUnit >= 0xD800 && highCodeUnit <= 0xDBFF) ? maybeHigh : last;
}

// getLastCodePoint(text): string | null
std::optional<std::u16string> getLastCodePoint(const std::u16string& text) {
  if (text.size() == 0) return std::nullopt;
  int32_t start = previousCodePointStart(text, static_cast<int32_t>(text.size()));
  return text.substr(start);
}

std::optional<std::u16string> getFirstSignificantCodePoint(const std::u16string& text) {
  for (const std::u16string& ch : codePoints(text)) {
    if (!reCombiningMark(ch)) return ch;
  }
  return std::nullopt;
}

std::optional<std::u16string> getLastSignificantCodePoint(const std::u16string& text) {
  for (int32_t end = static_cast<int32_t>(text.size()); end > 0;) {
    int32_t start = previousCodePointStart(text, end);
    std::u16string ch = text.substr(start, static_cast<size_t>(end - start));
    if (!reCombiningMark(ch)) return ch;
    end = start;
  }
  return std::nullopt;
}

// --- line-start prohibited / keep-all glue predicates ---

bool endsWithLineStartProhibitedText(const std::u16string& text) {
  std::optional<std::u16string> last = getLastCodePoint(text);
  return last.has_value() && (inKinsokuStart(cpOf(*last)) || inLeftStickyPunctuation(cpOf(*last)));
}

bool endsWithKeepAllGlueText(const std::u16string& text) {
  std::optional<std::u16string> last = getLastCodePoint(text);
  return last.has_value() && inKeepAllGlueChars(cpOf(*last));
}

bool endsWithKeepAllDashBreakText(const std::u16string& text) {
  std::optional<std::u16string> last = getLastCodePoint(text);
  return last.has_value() && inKeepAllDashBreakChars(cpOf(*last));
}

}  // namespace

bool canContinueKeepAllTextRun(const std::u16string& previousText, bool breakAfterPunctuation) {
  if (endsWithKeepAllGlueText(previousText)) return false;
  if (!breakAfterPunctuation) return true;
  if (endsWithLineStartProhibitedText(previousText)) return false;
  if (endsWithKeepAllDashBreakText(previousText)) return false;
  return true;
}

// --- public single-grapheme membership tests (full-string) ---
// TS Sets hold single BMP code units; membership is size==1 && cp in set.

bool isKinsokuStart(const std::u16string& grapheme) {
  return grapheme.size() == 1 && inKinsokuStart(grapheme[0]);
}
bool isKinsokuEnd(const std::u16string& grapheme) {
  return grapheme.size() == 1 && inKinsokuEnd(grapheme[0]);
}
bool isLeftStickyPunctuation(const std::u16string& grapheme) {
  return grapheme.size() == 1 && inLeftStickyPunctuation(grapheme[0]);
}

namespace {

// --- line-break numeric affix ranges (UAX #14 PR/PO) ---

constexpr uint32_t kLineBreakNumericAffixRanges[] = {
  0x0024, 0x0025, 0x002B, 0x002B, 0x005C, 0x005C, 0x00A2, 0x00A5, 0x00B0, 0x00B1,
  0x058F, 0x058F, 0x0609, 0x060B, 0x066A, 0x066A, 0x07FE, 0x07FF, 0x09F2, 0x09F3,
  0x09F9, 0x09FB, 0x0AF1, 0x0AF1, 0x0BF9, 0x0BF9, 0x0D79, 0x0D79, 0x0E3F, 0x0E3F,
  0x17DB, 0x17DB, 0x2030, 0x2037, 0x2057, 0x2057, 0x20A0, 0x20CF, 0x2103, 0x2103,
  0x2109, 0x2109, 0x2116, 0x2116, 0x2212, 0x2213, 0xA838, 0xA838, 0xFDFC, 0xFDFC,
  0xFE69, 0xFE6A, 0xFF04, 0xFF05, 0xFFE0, 0xFFE1, 0xFFE5, 0xFFE6,
  0x11FDD, 0x11FE0, 0x1E2FF, 0x1E2FF, 0x1ECAC, 0x1ECAC, 0x1ECB0, 0x1ECB0,
};
constexpr int kLineBreakNumericAffixRangesLen =
    sizeof(kLineBreakNumericAffixRanges) / sizeof(kLineBreakNumericAffixRanges[0]);

bool isCodePointInRanges(char32_t codePoint, const uint32_t* ranges, int len) {
  for (int i = 0; i < len; i += 2) {
    if (codePoint >= ranges[i] && codePoint <= ranges[i + 1]) return true;
  }
  return false;
}

// isLineBreakNumericAffix(ch): ch is a single code-point string.
bool isLineBreakNumericAffix(const std::u16string& ch) {
  if (ch.empty()) return false;  // ch.codePointAt(0) !== undefined
  char32_t codePoint = codePointAt(ch, 0);
  return isCodePointInRanges(codePoint, kLineBreakNumericAffixRanges, kLineBreakNumericAffixRangesLen);
}

bool endsWithLineBreakNumericAffix(const std::u16string& text) {
  std::optional<std::u16string> last = getLastSignificantCodePoint(text);
  return last.has_value() && isLineBreakNumericAffix(*last);
}

bool startsWithDecimalDigit(const std::u16string& text) {
  std::optional<std::u16string> first = getFirstSignificantCodePoint(text);
  return first.has_value() && reDecimalDigit(*first);
}

// --- segment-class predicates ---

bool isEscapedQuoteClusterSegment(const std::u16string& segment) {
  bool sawQuote = false;
  for (const std::u16string& ch : codePoints(segment)) {
    if (ch == u"\\" || reCombiningMark(ch)) continue;
    char32_t cp = cpOf(ch);
    if (inKinsokuEnd(cp) || inLeftStickyPunctuation(cp) || inForwardStickyGlue(cp)) {
      sawQuote = true;
      continue;
    }
    return false;
  }
  return sawQuote;
}

bool isLeftStickyPunctuationSegment(const std::u16string& segment) {
  if (isEscapedQuoteClusterSegment(segment)) return true;
  bool sawPunctuation = false;
  for (const std::u16string& ch : codePoints(segment)) {
    if (inLeftStickyPunctuation(cpOf(ch)) || isLineBreakNumericAffix(ch)) {
      sawPunctuation = true;
      continue;
    }
    if (sawPunctuation && reCombiningMark(ch)) continue;
    return false;
  }
  return sawPunctuation;
}

bool isCJKLineStartProhibitedSegment(const std::u16string& segment) {
  for (const std::u16string& ch : codePoints(segment)) {
    char32_t cp = cpOf(ch);
    if (!inKinsokuStart(cp) && !inLeftStickyPunctuation(cp)) return false;
  }
  return segment.size() > 0;
}

bool isForwardStickyClusterSegment(const std::u16string& segment) {
  if (isEscapedQuoteClusterSegment(segment)) return true;
  for (const std::u16string& ch : codePoints(segment)) {
    char32_t cp = cpOf(ch);
    if (
      !inKinsokuEnd(cp) &&
      !inForwardStickyGlue(cp) &&
      !reCombiningMark(ch) &&
      !isLineBreakNumericAffix(ch)
    ) {
      return false;
    }
  }
  return segment.size() > 0;
}

struct HeadTail {
  std::u16string head;
  std::u16string tail;
};

std::optional<HeadTail> splitTrailingForwardStickyCluster(const std::u16string& text) {
  std::vector<std::u16string> chars = codePoints(text);
  int32_t splitIndex = static_cast<int32_t>(chars.size());

  while (splitIndex > 0) {
    const std::u16string& ch = chars[splitIndex - 1];
    if (reCombiningMark(ch)) {
      splitIndex--;
      continue;
    }
    char32_t cp = cpOf(ch);
    if (inKinsokuEnd(cp) || inForwardStickyGlue(cp)) {
      splitIndex--;
      continue;
    }
    break;
  }

  if (splitIndex <= 0 || splitIndex == static_cast<int32_t>(chars.size())) return std::nullopt;

  HeadTail out;
  for (int32_t j = 0; j < splitIndex; j++) out.head += chars[j];
  for (int32_t j = splitIndex; j < static_cast<int32_t>(chars.size()); j++) out.tail += chars[j];
  return out;
}

std::optional<std::u16string> getRepeatableSingleCharRunChar(
    const std::u16string& text, bool isWordLike, SegmentBreakKind kind) {
  if (kind == SegmentBreakKind::Text && !isWordLike && text.size() == 1 && text != u"-" && text != u"—") {
    return text;
  }
  return std::nullopt;
}

std::u16string materializeDeferredSingleCharRun(
    std::vector<std::u16string>& texts,
    std::vector<std::optional<std::u16string>>& chars,
    std::vector<int32_t>& lengths,
    int32_t index) {
  const std::optional<std::u16string>& ch = chars[index];
  std::u16string text = texts[index];
  if (!ch.has_value()) return text;

  int32_t length = lengths[index];
  if (static_cast<int32_t>(text.size()) == length) return text;

  std::u16string materialized = repeat(*ch, length);
  texts[index] = materialized;
  return materialized;
}

bool hasArabicNoSpacePunctuation(bool containsArabic, const std::optional<std::u16string>& lastCodePoint) {
  return containsArabic && lastCodePoint.has_value() && inArabicNoSpaceTrailingPunctuation(cpOf(*lastCodePoint));
}

bool endsWithMyanmarMedialGlue(const std::u16string& segment) {
  std::optional<std::u16string> lastCodePoint = getLastCodePoint(segment);
  return lastCodePoint.has_value() && inMyanmarMedialGlue(cpOf(*lastCodePoint));
}

struct SpaceMarks {
  std::u16string space;
  std::u16string marks;
};

std::optional<SpaceMarks> splitLeadingSpaceAndMarks(const std::u16string& segment) {
  if (segment.size() < 2 || segment[0] != u' ') return std::nullopt;
  std::u16string marks = segment.substr(1);
  if (isAllMarksNonEmpty(marks)) {
    return SpaceMarks{u" ", marks};
  }
  return std::nullopt;
}

}  // namespace

bool endsWithClosingQuote(const std::u16string& text) {
  int32_t end = static_cast<int32_t>(text.size());
  while (end > 0) {
    int32_t start = previousCodePointStart(text, end);
    std::u16string ch = text.substr(start, static_cast<size_t>(end - start));
    char32_t cp = cpOf(ch);
    if (inClosingQuoteChars(cp)) return true;
    if (!inLeftStickyPunctuation(cp)) return false;
    end = start;
  }
  return false;
}

namespace {

// ch is a single code-point string; compare code units explicitly so the
// source stays ASCII-clean.
SegmentBreakKind classifySegmentBreakChar(const std::u16string& ch, const WhiteSpaceProfile& wsp) {
  bool single = ch.size() == 1;
  char16_t c = single ? ch[0] : 0;
  if (wsp.preserveOrdinarySpaces || wsp.preserveHardBreaks) {
    if (single && c == 0x20) return SegmentBreakKind::PreservedSpace;      // ' '
    if (single && c == 0x09) return SegmentBreakKind::Tab;                 // '\t'
    if (wsp.preserveHardBreaks && single && c == 0x0A) return SegmentBreakKind::HardBreak;  // '\n'
  }
  if (single && c == 0x20) return SegmentBreakKind::Space;                 // ' '
  if (single && (c == 0x00A0 || c == 0x202F || c == 0x2060 || c == 0xFEFF)) {
    return SegmentBreakKind::Glue;
  }
  if (single && c == 0x200B) return SegmentBreakKind::ZeroWidthBreak;
  if (single && c == 0x00AD) return SegmentBreakKind::SoftHyphen;
  return SegmentBreakKind::Text;
}

// breakCharRe = /[\x20\t\n\xA0\xAD​ ⁠﻿]/
bool containsBreakChar(const std::u16string& segment) {
  for (char16_t c : segment) {
    switch (c) {
      case 0x20: case 0x09: case 0x0A: case 0xA0: case 0xAD:
      case 0x200B: case 0x202F: case 0x2060: case 0xFEFF:
        return true;
      default:
        break;
    }
  }
  return false;
}

std::u16string joinTextParts(const std::vector<std::u16string>& parts) {
  if (parts.size() == 1) return parts[0];
  std::u16string out;
  for (const std::u16string& p : parts) out += p;
  return out;
}

std::u16string joinReversedPrefixParts(const std::vector<std::u16string>& prefixParts, const std::u16string& tail) {
  std::vector<std::u16string> parts;
  for (int32_t i = static_cast<int32_t>(prefixParts.size()) - 1; i >= 0; i--) {
    parts.push_back(prefixParts[i]);
  }
  parts.push_back(tail);
  return joinTextParts(parts);
}

std::vector<SegmentationPiece> splitSegmentByBreakKind(
    const std::u16string& segment,
    bool isWordLike,
    int32_t start,
    const WhiteSpaceProfile& wsp) {
  if (!containsBreakChar(segment)) {
    return {SegmentationPiece{segment, isWordLike, SegmentBreakKind::Text, start}};
  }

  std::vector<SegmentationPiece> pieces;
  bool haveCurrent = false;
  SegmentBreakKind currentKind = SegmentBreakKind::Text;
  std::vector<std::u16string> currentTextParts;
  int32_t currentStart = start;
  bool currentWordLike = false;
  int32_t offset = 0;

  for (const std::u16string& ch : codePoints(segment)) {
    SegmentBreakKind kind = classifySegmentBreakChar(ch, wsp);
    bool wordLike = kind == SegmentBreakKind::Text && isWordLike;

    if (haveCurrent && kind == currentKind && wordLike == currentWordLike) {
      currentTextParts.push_back(ch);
      offset += static_cast<int32_t>(ch.size());
      continue;
    }

    if (haveCurrent) {
      pieces.push_back(SegmentationPiece{
          joinTextParts(currentTextParts), currentWordLike, currentKind, currentStart});
    }

    haveCurrent = true;
    currentKind = kind;
    currentTextParts = {ch};
    currentStart = start + offset;
    currentWordLike = wordLike;
    offset += static_cast<int32_t>(ch.size());
  }

  if (haveCurrent) {
    pieces.push_back(SegmentationPiece{
        joinTextParts(currentTextParts), currentWordLike, currentKind, currentStart});
  }

  return pieces;
}

bool isTextRunBoundary(SegmentBreakKind kind) {
  return (
    kind == SegmentBreakKind::Space ||
    kind == SegmentBreakKind::PreservedSpace ||
    kind == SegmentBreakKind::ZeroWidthBreak ||
    kind == SegmentBreakKind::HardBreak
  );
}

// urlSchemeSegmentRe = /^[A-Za-z][A-Za-z0-9+.-]*:$/
bool matchesUrlSchemeSegment(const std::u16string& s) {
  size_t n = s.size();
  if (n < 2) return false;
  char16_t first = s[0];
  bool firstAlpha = (first >= u'A' && first <= u'Z') || (first >= u'a' && first <= u'z');
  if (!firstAlpha) return false;
  if (s[n - 1] != u':') return false;
  for (size_t i = 1; i + 1 < n; i++) {
    char16_t c = s[i];
    bool ok = (c >= u'A' && c <= u'Z') || (c >= u'a' && c <= u'z') ||
              (c >= u'0' && c <= u'9') || c == u'+' || c == u'.' || c == u'-';
    if (!ok) return false;
  }
  return true;
}

bool isUrlLikeRunStart(const MergedSegmentation& segmentation, int32_t index) {
  const std::u16string& text = segmentation.texts[index];
  if (startsWith(text, u"www.")) return true;
  return (
    matchesUrlSchemeSegment(text) &&
    index + 1 < segmentation.len &&
    segmentation.kinds[index + 1] == SegmentBreakKind::Text &&
    segmentation.texts[index + 1] == u"//"
  );
}

bool isUrlQueryBoundarySegment(const std::u16string& text) {
  return includes(text, u"?") && (includes(text, u"://") || startsWith(text, u"www."));
}

MergedSegmentation mergeUrlLikeRuns(const MergedSegmentation& segmentation) {
  std::vector<std::u16string> texts = segmentation.texts;
  std::vector<bool> isWordLike = segmentation.isWordLike;
  std::vector<SegmentBreakKind> kinds = segmentation.kinds;
  std::vector<int32_t> starts = segmentation.starts;

  for (int32_t i = 0; i < segmentation.len; i++) {
    if (kinds[i] != SegmentBreakKind::Text || !isUrlLikeRunStart(segmentation, i)) continue;

    std::vector<std::u16string> mergedParts = {texts[i]};
    int32_t j = i + 1;
    while (j < segmentation.len && !isTextRunBoundary(kinds[j])) {
      mergedParts.push_back(texts[j]);
      isWordLike[i] = true;
      bool endsQueryPrefix = includes(texts[j], u"?");
      kinds[j] = SegmentBreakKind::Text;
      texts[j] = u"";
      j++;
      if (endsQueryPrefix) break;
    }
    texts[i] = joinTextParts(mergedParts);
  }

  int32_t compactLen = 0;
  for (int32_t read = 0; read < static_cast<int32_t>(texts.size()); read++) {
    const std::u16string& text = texts[read];
    if (text.size() == 0) continue;
    if (compactLen != read) {
      texts[compactLen] = text;
      isWordLike[compactLen] = isWordLike[read];
      kinds[compactLen] = kinds[read];
      starts[compactLen] = starts[read];
    }
    compactLen++;
  }

  texts.resize(compactLen);
  isWordLike.resize(compactLen);
  kinds.resize(compactLen);
  starts.resize(compactLen);

  return MergedSegmentation{compactLen, std::move(texts), std::move(isWordLike), std::move(kinds), std::move(starts)};
}

MergedSegmentation mergeUrlQueryRuns(const MergedSegmentation& segmentation) {
  std::vector<std::u16string> texts;
  std::vector<bool> isWordLike;
  std::vector<SegmentBreakKind> kinds;
  std::vector<int32_t> starts;

  for (int32_t i = 0; i < segmentation.len; i++) {
    const std::u16string& text = segmentation.texts[i];
    texts.push_back(text);
    isWordLike.push_back(segmentation.isWordLike[i]);
    kinds.push_back(segmentation.kinds[i]);
    starts.push_back(segmentation.starts[i]);

    if (!isUrlQueryBoundarySegment(text)) continue;

    int32_t nextIndex = i + 1;
    if (nextIndex >= segmentation.len || isTextRunBoundary(segmentation.kinds[nextIndex])) {
      continue;
    }

    std::vector<std::u16string> queryParts;
    int32_t queryStart = segmentation.starts[nextIndex];
    int32_t j = nextIndex;
    while (j < segmentation.len && !isTextRunBoundary(segmentation.kinds[j])) {
      queryParts.push_back(segmentation.texts[j]);
      j++;
    }

    if (queryParts.size() > 0) {
      texts.push_back(joinTextParts(queryParts));
      isWordLike.push_back(true);
      kinds.push_back(SegmentBreakKind::Text);
      starts.push_back(queryStart);
      i = j - 1;
    }
  }

  return MergedSegmentation{static_cast<int32_t>(texts.size()), std::move(texts), std::move(isWordLike), std::move(kinds), std::move(starts)};
}

bool segmentContainsDecimalDigit(const std::u16string& text) {
  for (const std::u16string& ch : codePoints(text)) {
    if (reDecimalDigit(ch)) return true;
  }
  return false;
}

}  // namespace

bool isNumericRunSegment(const std::u16string& text) {
  if (text.size() == 0) return false;
  for (const std::u16string& ch : codePoints(text)) {
    if (reDecimalDigit(ch) || inNumericJoinerChars(cpOf(ch))) continue;
    return false;
  }
  return true;
}

namespace {

// isNoSpaceWordInternalSymbol(ch): ch is a single code-point string.
bool isAsciiWordInternalSymbolCode(int32_t code) {
  return (
    (code >= 0x21 && code <= 0x2F && code != 0x2D) ||
    (code >= 0x3A && code <= 0x40 && code != 0x3F) ||
    (code >= 0x5B && code <= 0x60) ||
    (code >= 0x7B && code <= 0x7E)
  );
}

bool isNoSpaceWordInternalSymbol(const std::u16string& ch) {
  int32_t code = ch.empty() ? 0 : ch[0];  // ch.charCodeAt(0)
  if (code < 0x80) return isAsciiWordInternalSymbolCode(code);

  return (
    !inNoSpaceWordBreakAfterChars(cpOf(ch)) &&
    !reEmojiPresentation(ch) &&
    reWordInternalSymbol(ch)
  );
}

bool isNoSpaceWordInternalSymbolSegment(const std::u16string& text) {
  bool sawSymbol = false;
  for (const std::u16string& ch : codePoints(text)) {
    if (reCombiningMark(ch)) continue;
    if (!isNoSpaceWordInternalSymbol(ch)) return false;
    sawSymbol = true;
  }
  return sawSymbol;
}

bool endsWithNoSpaceWordJoiner(const std::u16string& text) {
  for (int32_t end = static_cast<int32_t>(text.size()); end > 0;) {
    int32_t start = previousCodePointStart(text, end);
    std::u16string ch = text.substr(start, static_cast<size_t>(end - start));
    if (reCombiningMark(ch)) {
      end = start;
      continue;
    }
    return isNoSpaceWordInternalSymbol(ch) || isLineBreakNumericAffix(ch);
  }
  return false;
}

bool canJoinNoSpaceWordBoundary(
    const std::u16string& leftText, bool leftWordLike,
    const std::u16string& rightText, bool rightWordLike) {
  bool leftSymbol = !leftWordLike && isNoSpaceWordInternalSymbolSegment(leftText);
  bool rightSymbol = !rightWordLike && isNoSpaceWordInternalSymbolSegment(rightText);
  bool leftAffix = endsWithLineBreakNumericAffix(leftText);
  bool leftEndsJoiner = (leftWordLike || leftAffix) && endsWithNoSpaceWordJoiner(leftText);

  if (!leftSymbol && !rightSymbol && !leftEndsJoiner) return false;
  if (isCJK(leftText) || isCJK(rightText)) return false;

  return (leftWordLike || leftSymbol || leftAffix) && (rightWordLike || rightSymbol);
}

MergedSegmentation mergeNumericRuns(const MergedSegmentation& segmentation) {
  std::vector<std::u16string> texts;
  std::vector<bool> isWordLike;
  std::vector<SegmentBreakKind> kinds;
  std::vector<int32_t> starts;

  for (int32_t i = 0; i < segmentation.len; i++) {
    const std::u16string& text = segmentation.texts[i];
    SegmentBreakKind kind = segmentation.kinds[i];

    if (kind == SegmentBreakKind::Text && isNumericRunSegment(text) && segmentContainsDecimalDigit(text)) {
      std::vector<std::u16string> mergedParts = {text};
      int32_t j = i + 1;
      while (
        j < segmentation.len &&
        segmentation.kinds[j] == SegmentBreakKind::Text &&
        isNumericRunSegment(segmentation.texts[j])
      ) {
        mergedParts.push_back(segmentation.texts[j]);
        j++;
      }

      texts.push_back(joinTextParts(mergedParts));
      isWordLike.push_back(true);
      kinds.push_back(SegmentBreakKind::Text);
      starts.push_back(segmentation.starts[i]);
      i = j - 1;
      continue;
    }

    texts.push_back(text);
    isWordLike.push_back(segmentation.isWordLike[i]);
    kinds.push_back(kind);
    starts.push_back(segmentation.starts[i]);
  }

  return MergedSegmentation{static_cast<int32_t>(texts.size()), std::move(texts), std::move(isWordLike), std::move(kinds), std::move(starts)};
}

MergedSegmentation mergeNoSpaceWordChains(const MergedSegmentation& segmentation) {
  std::vector<std::u16string> texts;
  std::vector<bool> isWordLike;
  std::vector<SegmentBreakKind> kinds;
  std::vector<int32_t> starts;

  int32_t i = 0;
  while (i < segmentation.len) {
    const std::u16string& text = segmentation.texts[i];
    SegmentBreakKind kind = segmentation.kinds[i];
    bool wordLike = segmentation.isWordLike[i];

    if (kind == SegmentBreakKind::Text) {
      std::vector<std::u16string> mergedParts = {text};
      int32_t j = i + 1;
      bool mergedWordLike = wordLike;

      while (
        j < segmentation.len &&
        segmentation.kinds[j] == SegmentBreakKind::Text &&
        canJoinNoSpaceWordBoundary(
          segmentation.texts[j - 1],
          segmentation.isWordLike[j - 1],
          segmentation.texts[j],
          segmentation.isWordLike[j])
      ) {
        const std::u16string& nextText = segmentation.texts[j];
        mergedParts.push_back(nextText);
        mergedWordLike = mergedWordLike || static_cast<bool>(segmentation.isWordLike[j]);
        j++;
      }

      if (j > i + 1) {
        texts.push_back(joinTextParts(mergedParts));
        isWordLike.push_back(mergedWordLike);
        kinds.push_back(SegmentBreakKind::Text);
        starts.push_back(segmentation.starts[i]);
        i = j;
        continue;
      }
    }

    texts.push_back(text);
    isWordLike.push_back(wordLike);
    kinds.push_back(kind);
    starts.push_back(segmentation.starts[i]);
    i++;
  }

  return MergedSegmentation{static_cast<int32_t>(texts.size()), std::move(texts), std::move(isWordLike), std::move(kinds), std::move(starts)};
}

MergedSegmentation splitHyphenatedNumericRuns(const MergedSegmentation& segmentation) {
  std::vector<std::u16string> texts;
  std::vector<bool> isWordLike;
  std::vector<SegmentBreakKind> kinds;
  std::vector<int32_t> starts;

  for (int32_t i = 0; i < segmentation.len; i++) {
    const std::u16string& text = segmentation.texts[i];
    if (segmentation.kinds[i] == SegmentBreakKind::Text && includes(text, u"-")) {
      std::vector<std::u16string> parts = splitChar(text, u'-');
      bool shouldSplit = parts.size() > 1;
      for (size_t j = 0; j < parts.size(); j++) {
        const std::u16string& part = parts[j];
        if (!shouldSplit) break;
        if (
          part.size() == 0 ||
          !segmentContainsDecimalDigit(part) ||
          !isNumericRunSegment(part)
        ) {
          shouldSplit = false;
        }
      }

      if (shouldSplit) {
        int32_t offset = 0;
        for (size_t j = 0; j < parts.size(); j++) {
          const std::u16string& part = parts[j];
          std::u16string splitText = j < parts.size() - 1 ? (part + u"-") : part;
          texts.push_back(splitText);
          isWordLike.push_back(true);
          kinds.push_back(SegmentBreakKind::Text);
          starts.push_back(segmentation.starts[i] + offset);
          offset += static_cast<int32_t>(splitText.size());
        }
        continue;
      }
    }

    texts.push_back(text);
    isWordLike.push_back(segmentation.isWordLike[i]);
    kinds.push_back(segmentation.kinds[i]);
    starts.push_back(segmentation.starts[i]);
  }

  return MergedSegmentation{static_cast<int32_t>(texts.size()), std::move(texts), std::move(isWordLike), std::move(kinds), std::move(starts)};
}

MergedSegmentation mergeGlueConnectedTextRuns(const MergedSegmentation& segmentation) {
  std::vector<std::u16string> texts;
  std::vector<bool> isWordLike;
  std::vector<SegmentBreakKind> kinds;
  std::vector<int32_t> starts;

  int32_t read = 0;
  while (read < segmentation.len) {
    std::vector<std::u16string> textParts = {segmentation.texts[read]};
    bool wordLike = segmentation.isWordLike[read];
    SegmentBreakKind kind = segmentation.kinds[read];
    int32_t start = segmentation.starts[read];

    if (kind == SegmentBreakKind::Glue) {
      std::vector<std::u16string> glueParts = {textParts[0]};
      int32_t glueStart = start;
      read++;
      while (read < segmentation.len && segmentation.kinds[read] == SegmentBreakKind::Glue) {
        glueParts.push_back(segmentation.texts[read]);
        read++;
      }
      std::u16string glueText = joinTextParts(glueParts);

      if (read < segmentation.len && segmentation.kinds[read] == SegmentBreakKind::Text) {
        textParts[0] = glueText;
        textParts.push_back(segmentation.texts[read]);
        wordLike = segmentation.isWordLike[read];
        kind = SegmentBreakKind::Text;
        start = glueStart;
        read++;
      } else {
        texts.push_back(glueText);
        isWordLike.push_back(false);
        kinds.push_back(SegmentBreakKind::Glue);
        starts.push_back(glueStart);
        continue;
      }
    } else {
      read++;
    }

    if (kind == SegmentBreakKind::Text) {
      while (read < segmentation.len && segmentation.kinds[read] == SegmentBreakKind::Glue) {
        std::vector<std::u16string> glueParts;
        while (read < segmentation.len && segmentation.kinds[read] == SegmentBreakKind::Glue) {
          glueParts.push_back(segmentation.texts[read]);
          read++;
        }
        std::u16string glueText = joinTextParts(glueParts);

        if (read < segmentation.len && segmentation.kinds[read] == SegmentBreakKind::Text) {
          textParts.push_back(glueText);
          textParts.push_back(segmentation.texts[read]);
          wordLike = wordLike || static_cast<bool>(segmentation.isWordLike[read]);
          read++;
          continue;
        }

        textParts.push_back(glueText);
      }
    }

    texts.push_back(joinTextParts(textParts));
    isWordLike.push_back(wordLike);
    kinds.push_back(kind);
    starts.push_back(start);
  }

  return MergedSegmentation{static_cast<int32_t>(texts.size()), std::move(texts), std::move(isWordLike), std::move(kinds), std::move(starts)};
}

MergedSegmentation carryTrailingForwardStickyAcrossCJKBoundary(const MergedSegmentation& segmentation) {
  std::vector<std::u16string> texts = segmentation.texts;
  std::vector<bool> isWordLike = segmentation.isWordLike;
  std::vector<SegmentBreakKind> kinds = segmentation.kinds;
  std::vector<int32_t> starts = segmentation.starts;

  for (int32_t i = 0; i < static_cast<int32_t>(texts.size()) - 1; i++) {
    if (kinds[i] != SegmentBreakKind::Text || kinds[i + 1] != SegmentBreakKind::Text) continue;
    if (!isCJK(texts[i]) || !isCJK(texts[i + 1])) continue;

    std::optional<HeadTail> split = splitTrailingForwardStickyCluster(texts[i]);
    if (!split.has_value()) continue;

    texts[i] = split->head;
    texts[i + 1] = split->tail + texts[i + 1];
    starts[i + 1] = starts[i] + static_cast<int32_t>(split->head.size());
  }

  return MergedSegmentation{static_cast<int32_t>(texts.size()), std::move(texts), std::move(isWordLike), std::move(kinds), std::move(starts)};
}

MergedSegmentation buildMergedSegmentation(
    const std::u16string& normalized,
    const AnalysisProfile& profile,
    const WhiteSpaceProfile& whiteSpaceProfile) {
  int32_t mergedLen = 0;
  std::vector<std::u16string> mergedTexts;
  std::vector<std::vector<std::u16string>> mergedTextParts;
  std::vector<bool> mergedWordLike;
  std::vector<SegmentBreakKind> mergedKinds;
  std::vector<int32_t> mergedStarts;
  // Track repeatable single-char punctuation runs structurally so identical
  // merges stay O(1) instead of re-scanning the accumulated segment each time.
  std::vector<std::optional<std::u16string>> mergedSingleCharRunChars;
  std::vector<int32_t> mergedSingleCharRunLengths;
  std::vector<bool> mergedContainsCJK;
  std::vector<bool> mergedContainsArabicScript;
  std::vector<bool> mergedEndsWithClosingQuote;
  std::vector<bool> mergedEndsWithMyanmarMedialGlue;
  std::vector<bool> mergedHasArabicNoSpacePunctuation;

  for (const seg::WordSegment& s : seg::iterateWords(normalized)) {
    for (const SegmentationPiece& piece :
         splitSegmentByBreakKind(s.segment, s.isWordLike, s.index, whiteSpaceProfile)) {
      bool isText = piece.kind == SegmentBreakKind::Text;
      std::optional<std::u16string> repeatableSingleCharRunChar =
          getRepeatableSingleCharRunChar(piece.text, piece.isWordLike, piece.kind);
      bool pieceContainsCJK = isCJK(piece.text);
      bool pieceContainsArabicScript = containsArabicScript(piece.text);
      std::optional<std::u16string> pieceLastCodePoint = getLastCodePoint(piece.text);
      bool pieceEndsWithClosingQuote = endsWithClosingQuote(piece.text);
      bool pieceEndsWithMyanmarMedialGlue = endsWithMyanmarMedialGlue(piece.text);
      int32_t prevIndex = mergedLen - 1;

      auto appendPieceToPrevious = [&]() {
        if (mergedSingleCharRunChars[prevIndex].has_value()) {
          mergedTextParts[prevIndex] = {
              materializeDeferredSingleCharRun(
                  mergedTexts,
                  mergedSingleCharRunChars,
                  mergedSingleCharRunLengths,
                  prevIndex),
          };
          mergedSingleCharRunChars[prevIndex] = std::nullopt;
        }
        mergedTextParts[prevIndex].push_back(piece.text);
        mergedWordLike[prevIndex] = static_cast<bool>(mergedWordLike[prevIndex]) || piece.isWordLike;
        mergedContainsCJK[prevIndex] = static_cast<bool>(mergedContainsCJK[prevIndex]) || pieceContainsCJK;
        mergedContainsArabicScript[prevIndex] =
            static_cast<bool>(mergedContainsArabicScript[prevIndex]) || pieceContainsArabicScript;
        mergedEndsWithClosingQuote[prevIndex] = pieceEndsWithClosingQuote;
        mergedEndsWithMyanmarMedialGlue[prevIndex] = pieceEndsWithMyanmarMedialGlue;
        mergedHasArabicNoSpacePunctuation[prevIndex] = hasArabicNoSpacePunctuation(
            static_cast<bool>(mergedContainsArabicScript[prevIndex]),
            pieceLastCodePoint);
      };

      // First-pass keeps: no-space script-specific joins and punctuation glue
      // that depend on the immediately preceding text run.
      if (
        profile.carryCJKAfterClosingQuote &&
        isText &&
        mergedLen > 0 &&
        mergedKinds[prevIndex] == SegmentBreakKind::Text &&
        pieceContainsCJK &&
        static_cast<bool>(mergedContainsCJK[prevIndex]) &&
        static_cast<bool>(mergedEndsWithClosingQuote[prevIndex])
      ) {
        appendPieceToPrevious();
      } else if (
        isText &&
        mergedLen > 0 &&
        mergedKinds[prevIndex] == SegmentBreakKind::Text &&
        isCJKLineStartProhibitedSegment(piece.text) &&
        static_cast<bool>(mergedContainsCJK[prevIndex])
      ) {
        appendPieceToPrevious();
      } else if (
        isText &&
        mergedLen > 0 &&
        mergedKinds[prevIndex] == SegmentBreakKind::Text &&
        static_cast<bool>(mergedEndsWithMyanmarMedialGlue[prevIndex])
      ) {
        appendPieceToPrevious();
      } else if (
        isText &&
        mergedLen > 0 &&
        mergedKinds[prevIndex] == SegmentBreakKind::Text &&
        piece.isWordLike &&
        pieceContainsArabicScript &&
        static_cast<bool>(mergedHasArabicNoSpacePunctuation[prevIndex])
      ) {
        appendPieceToPrevious();
        mergedWordLike[prevIndex] = true;
      } else if (
        repeatableSingleCharRunChar.has_value() &&
        mergedLen > 0 &&
        mergedKinds[prevIndex] == SegmentBreakKind::Text &&
        mergedSingleCharRunChars[prevIndex] == repeatableSingleCharRunChar
      ) {
        mergedSingleCharRunLengths[prevIndex] = mergedSingleCharRunLengths[prevIndex] + 1;
      } else if (
        isText &&
        !piece.isWordLike &&
        mergedLen > 0 &&
        mergedKinds[prevIndex] == SegmentBreakKind::Text &&
        !static_cast<bool>(mergedContainsCJK[prevIndex]) &&
        (
          isLeftStickyPunctuationSegment(piece.text) ||
          (piece.text == u"-" && static_cast<bool>(mergedWordLike[prevIndex]))
        )
      ) {
        appendPieceToPrevious();
      } else {
        mergedTexts.push_back(piece.text);
        mergedTextParts.push_back({piece.text});
        mergedWordLike.push_back(piece.isWordLike);
        mergedKinds.push_back(piece.kind);
        mergedStarts.push_back(piece.start);
        mergedSingleCharRunChars.push_back(repeatableSingleCharRunChar);
        mergedSingleCharRunLengths.push_back(repeatableSingleCharRunChar.has_value() ? 1 : 0);
        mergedContainsCJK.push_back(pieceContainsCJK);
        mergedContainsArabicScript.push_back(pieceContainsArabicScript);
        mergedEndsWithClosingQuote.push_back(pieceEndsWithClosingQuote);
        mergedEndsWithMyanmarMedialGlue.push_back(pieceEndsWithMyanmarMedialGlue);
        mergedHasArabicNoSpacePunctuation.push_back(hasArabicNoSpacePunctuation(
            pieceContainsArabicScript,
            pieceLastCodePoint));
        mergedLen++;
      }
    }
  }

  for (int32_t i = 0; i < mergedLen; i++) {
    if (mergedSingleCharRunChars[i].has_value()) {
      mergedTexts[i] = materializeDeferredSingleCharRun(
          mergedTexts,
          mergedSingleCharRunChars,
          mergedSingleCharRunLengths,
          i);
      continue;
    }
    mergedTexts[i] = joinTextParts(mergedTextParts[i]);
  }

  // Later passes operate on the merged text stream itself: contextual escaped
  // quote glue, forward-sticky carry, compaction, then the broader URL/numeric
  // and Arabic-leading-mark fixes.
  for (int32_t i = 1; i < mergedLen; i++) {
    if (
      mergedKinds[i] == SegmentBreakKind::Text &&
      !static_cast<bool>(mergedWordLike[i]) &&
      isEscapedQuoteClusterSegment(mergedTexts[i]) &&
      mergedKinds[i - 1] == SegmentBreakKind::Text &&
      !static_cast<bool>(mergedContainsCJK[i - 1])
    ) {
      mergedTexts[i - 1] += mergedTexts[i];
      mergedWordLike[i - 1] = static_cast<bool>(mergedWordLike[i - 1]) || static_cast<bool>(mergedWordLike[i]);
      mergedTexts[i] = u"";
    }
  }

  std::vector<std::optional<std::vector<std::u16string>>> forwardStickyPrefixParts(mergedLen, std::nullopt);
  int32_t nextLiveIndex = -1;

  for (int32_t i = mergedLen - 1; i >= 0; i--) {
    const std::u16string& text = mergedTexts[i];
    if (text.size() == 0) continue;

    if (
      mergedKinds[i] == SegmentBreakKind::Text &&
      !static_cast<bool>(mergedWordLike[i]) &&
      nextLiveIndex >= 0 &&
      mergedKinds[nextLiveIndex] == SegmentBreakKind::Text &&
      (
        isForwardStickyClusterSegment(text) ||
        (text == u"-" && startsWithDecimalDigit(mergedTexts[nextLiveIndex]))
      )
    ) {
      std::optional<std::vector<std::u16string>>& slot = forwardStickyPrefixParts[nextLiveIndex];
      std::vector<std::u16string> prefixParts = slot.has_value() ? *slot : std::vector<std::u16string>{};
      prefixParts.push_back(text);
      forwardStickyPrefixParts[nextLiveIndex] = std::move(prefixParts);
      mergedStarts[nextLiveIndex] = mergedStarts[i];
      mergedTexts[i] = u"";
      continue;
    }

    nextLiveIndex = i;
  }

  for (int32_t i = 0; i < mergedLen; i++) {
    const std::optional<std::vector<std::u16string>>& prefixParts = forwardStickyPrefixParts[i];
    if (!prefixParts.has_value()) continue;
    mergedTexts[i] = joinReversedPrefixParts(*prefixParts, mergedTexts[i]);
  }

  int32_t compactLen = 0;
  for (int32_t read = 0; read < mergedLen; read++) {
    const std::u16string& text = mergedTexts[read];
    if (text.size() == 0) continue;
    if (compactLen != read) {
      mergedTexts[compactLen] = text;
      mergedWordLike[compactLen] = mergedWordLike[read];
      mergedKinds[compactLen] = mergedKinds[read];
      mergedStarts[compactLen] = mergedStarts[read];
    }
    compactLen++;
  }

  mergedTexts.resize(compactLen);
  mergedWordLike.resize(compactLen);
  mergedKinds.resize(compactLen);
  mergedStarts.resize(compactLen);

  // TS analysis.ts:1271 wraps the compacted arrays in mergeGlueConnectedTextRuns
  // BEFORE the URL/numeric/no-space/forward-sticky merges. Skipping it leaves
  // glue chars (U+00A0, U+202F, U+2060, U+FEFF) as standalone 'glue' segments
  // instead of gluing "10<U+202F>000" into one text run.
  MergedSegmentation compacted = mergeGlueConnectedTextRuns(MergedSegmentation{
      compactLen,
      std::move(mergedTexts),
      std::move(mergedWordLike),
      std::move(mergedKinds),
      std::move(mergedStarts)});

  MergedSegmentation withMergedUrls = carryTrailingForwardStickyAcrossCJKBoundary(
      mergeNoSpaceWordChains(
          splitHyphenatedNumericRuns(mergeNumericRuns(mergeUrlQueryRuns(mergeUrlLikeRuns(compacted))))));

  for (int32_t i = 0; i < withMergedUrls.len - 1; i++) {
    std::optional<SpaceMarks> split = splitLeadingSpaceAndMarks(withMergedUrls.texts[i]);
    if (!split.has_value()) continue;
    if (
      (withMergedUrls.kinds[i] != SegmentBreakKind::Space && withMergedUrls.kinds[i] != SegmentBreakKind::PreservedSpace) ||
      withMergedUrls.kinds[i + 1] != SegmentBreakKind::Text ||
      !containsArabicScript(withMergedUrls.texts[i + 1])
    ) {
      continue;
    }

    withMergedUrls.texts[i] = split->space;
    withMergedUrls.isWordLike[i] = false;
    withMergedUrls.kinds[i] = withMergedUrls.kinds[i] == SegmentBreakKind::PreservedSpace
                                  ? SegmentBreakKind::PreservedSpace
                                  : SegmentBreakKind::Space;
    withMergedUrls.texts[i + 1] = split->marks + withMergedUrls.texts[i + 1];
    withMergedUrls.starts[i + 1] = withMergedUrls.starts[i] + static_cast<int32_t>(split->space.size());
  }

  return withMergedUrls;
}

std::vector<AnalysisChunk> compileAnalysisChunks(
    const MergedSegmentation& segmentation, const WhiteSpaceProfile& whiteSpaceProfile) {
  if (segmentation.len == 0) return {};
  if (!whiteSpaceProfile.preserveHardBreaks) {
    return {AnalysisChunk{0, segmentation.len, segmentation.len}};
  }

  std::vector<AnalysisChunk> chunks;
  int32_t startSegmentIndex = 0;

  for (int32_t i = 0; i < segmentation.len; i++) {
    if (segmentation.kinds[i] != SegmentBreakKind::HardBreak) continue;

    chunks.push_back(AnalysisChunk{startSegmentIndex, i, i + 1});
    startSegmentIndex = i + 1;
  }

  if (startSegmentIndex < segmentation.len) {
    chunks.push_back(AnalysisChunk{startSegmentIndex, segmentation.len, segmentation.len});
  }

  return chunks;
}

MergedSegmentation mergeKeepAllTextSegments(
    const std::u16string& normalized,
    const MergedSegmentation& segmentation,
    bool breakAfterPunctuation) {
  if (segmentation.len <= 1) return segmentation;

  std::vector<std::u16string> texts;
  std::vector<bool> isWordLike;
  std::vector<SegmentBreakKind> kinds;
  std::vector<int32_t> starts;

  int32_t groupStart = -1;
  bool groupContainsCJK = false;

  auto pushOriginalText = [&](int32_t index) {
    texts.push_back(segmentation.texts[index]);
    isWordLike.push_back(segmentation.isWordLike[index]);
    kinds.push_back(SegmentBreakKind::Text);
    starts.push_back(segmentation.starts[index]);
  };

  auto pushMergedText = [&](int32_t start, int32_t end) {
    bool wordLike = false;
    for (int32_t i = start; i < end; i++) {
      wordLike = wordLike || static_cast<bool>(segmentation.isWordLike[i]);
    }

    int32_t sourceStart = segmentation.starts[start];
    int32_t sourceEnd = end < segmentation.len ? segmentation.starts[end] : static_cast<int32_t>(normalized.size());
    texts.push_back(normalized.substr(sourceStart, static_cast<size_t>(sourceEnd - sourceStart)));
    isWordLike.push_back(wordLike);
    kinds.push_back(SegmentBreakKind::Text);
    starts.push_back(sourceStart);
  };

  auto flushGroup = [&](int32_t end) {
    if (groupStart < 0) return;

    if (groupContainsCJK) {
      if (groupStart + 1 == end) {
        pushOriginalText(groupStart);
      } else {
        pushMergedText(groupStart, end);
      }
    } else {
      for (int32_t i = groupStart; i < end; i++) pushOriginalText(i);
    }

    groupStart = -1;
    groupContainsCJK = false;
  };

  for (int32_t i = 0; i < segmentation.len; i++) {
    const std::u16string& text = segmentation.texts[i];
    SegmentBreakKind kind = segmentation.kinds[i];

    if (kind == SegmentBreakKind::Text) {
      if (
        groupStart >= 0 &&
        !canContinueKeepAllTextRun(segmentation.texts[i - 1], breakAfterPunctuation)
      ) {
        flushGroup(i);
      }
      if (groupStart < 0) groupStart = i;
      groupContainsCJK = groupContainsCJK || isCJK(text);
      continue;
    }

    flushGroup(i);
    texts.push_back(text);
    isWordLike.push_back(segmentation.isWordLike[i]);
    kinds.push_back(kind);
    starts.push_back(segmentation.starts[i]);
  }

  flushGroup(segmentation.len);

  return MergedSegmentation{static_cast<int32_t>(texts.size()), std::move(texts), std::move(isWordLike), std::move(kinds), std::move(starts)};
}

}  // namespace

TextAnalysis analyzeText(
    const std::u16string& text,
    const AnalysisProfile& profile,
    WhiteSpaceMode whiteSpace,
    WordBreakMode wordBreak) {
  WhiteSpaceProfile whiteSpaceProfile = getWhiteSpaceProfile(whiteSpace);
  std::u16string normalized = whiteSpaceProfile.mode == WhiteSpaceMode::PreWrap
                                  ? normalizeWhitespacePreWrap(text)
                                  : normalizeWhitespaceNormal(text);
  if (normalized.size() == 0) {
    TextAnalysis empty;
    empty.normalized = normalized;
    empty.len = 0;
    return empty;
  }

  MergedSegmentation mergedSegmentation = buildMergedSegmentation(normalized, profile, whiteSpaceProfile);
  MergedSegmentation segmentation = wordBreak == WordBreakMode::KeepAll
                                        ? mergeKeepAllTextSegments(normalized, mergedSegmentation, profile.breakKeepAllAfterPunctuation)
                                        : std::move(mergedSegmentation);

  TextAnalysis result;
  result.normalized = normalized;
  result.chunks = compileAnalysisChunks(segmentation, whiteSpaceProfile);
  result.len = segmentation.len;
  result.texts = std::move(segmentation.texts);
  result.isWordLike = std::move(segmentation.isWordLike);
  result.kinds = std::move(segmentation.kinds);
  result.starts = std::move(segmentation.starts);
  return result;
}

}  // namespace pretext
