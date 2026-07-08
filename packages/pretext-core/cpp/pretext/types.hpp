// Shared types for the pretext-core C++ kernel.
// Mirrors @chenglou/pretext@0.0.8 src/{analysis,layout,line-break,rich-inline}.ts.
// See PORTING.md for the porting contract. Do not change signatures here
// without updating PORTING.md and every dependent module.
#pragma once

#include <cstdint>
#include <functional>
#include <memory>
#include <optional>
#include <string>
#include <unordered_map>
#include <vector>

namespace pretext {

// --- analysis.ts ---

enum class WhiteSpaceMode : uint8_t { Normal, PreWrap };
enum class WordBreakMode : uint8_t { Normal, KeepAll };

enum class SegmentBreakKind : uint8_t {
  Text,
  Space,
  PreservedSpace,
  Tab,
  Glue,
  ZeroWidthBreak,
  SoftHyphen,
  HardBreak,
};

struct AnalysisChunk {
  int32_t startSegmentIndex = 0;
  int32_t endSegmentIndex = 0;
  int32_t consumedEndSegmentIndex = 0;
};

// TextAnalysis = { normalized, chunks } & MergedSegmentation
struct TextAnalysis {
  std::u16string normalized;
  std::vector<AnalysisChunk> chunks;
  int32_t len = 0; // == texts.size(); kept to mirror the TS shape
  std::vector<std::u16string> texts;
  std::vector<bool> isWordLike;
  std::vector<SegmentBreakKind> kinds;
  std::vector<int32_t> starts; // UTF-16 code-unit offsets into `normalized`
};

// --- measurement.ts ---

enum class BreakableFitMode : uint8_t { SumGraphemes, SegmentPrefixes, PairContext };

struct SegmentMetrics {
  double width = 0;
  bool containsCJK = false;
  // emojiCount omitted: emojiCorrection ≡ 0 on native (PORTING.md rule 4).
  bool hasBreakableFit = false; // mirrors `breakableFitAdvances !== undefined`
  BreakableFitMode breakableFitMode = BreakableFitMode::SumGraphemes;
  // nullopt mirrors TS `null` (single grapheme — not breakable).
  std::optional<std::vector<double>> breakableFitAdvances;
};

struct EngineProfile {
  double lineFitEpsilon;
  bool carryCJKAfterClosingQuote;
  bool breakKeepAllAfterPunctuation;
  bool preferPrefixWidthsForBreakableRuns;
  bool preferEarlySoftHyphenBreak;
};

// The one profile native ever sees (neutral / no-navigator branch).
inline constexpr EngineProfile kNativeEngineProfile{
    /*lineFitEpsilon=*/0.005,
    /*carryCJKAfterClosingQuote=*/false,
    /*breakKeepAllAfterPunctuation=*/true,
    /*preferPrefixWidthsForBreakableRuns=*/false,
    /*preferEarlySoftHyphenBreak=*/false,
};

// --- layout.ts / line-break.ts ---

struct LayoutCursor {
  int32_t segmentIndex = 0;
  int32_t graphemeIndex = 0; // 0 at segment boundaries
};

struct PreparedLineChunk {
  int32_t startSegmentIndex = 0;
  int32_t endSegmentIndex = 0;
  int32_t consumedEndSegmentIndex = 0;
};

// PreparedCore + optional segments. `PreparedText` and
// `PreparedTextWithSegments` are both this struct; `hasSegments`
// distinguishes them (segments/segLevels only populated for the latter).
struct Prepared {
  std::vector<double> widths;
  std::vector<double> lineEndFitAdvances;
  std::vector<double> lineEndPaintAdvances;
  std::vector<SegmentBreakKind> kinds;
  bool simpleLineWalkFastPath = true;
  // segLevels: Int8Array | null → empty vector == null (rich path only).
  std::vector<int8_t> segLevels;
  bool hasSegLevels = false;
  // (number[] | null)[] → nullopt == null
  std::vector<std::optional<std::vector<double>>> breakableFitAdvances;
  std::vector<std::optional<std::vector<double>>> breakablePreferredBreaks;
  double letterSpacing = 0;
  std::vector<int32_t> spacingGraphemeCounts; // empty when letterSpacing == 0
  double discretionaryHyphenWidth = 0;
  double tabStopAdvance = 0;
  std::vector<PreparedLineChunk> chunks;

  bool hasSegments = false;
  std::vector<std::u16string> segments;

  // line-text.ts getLineTextCache lives on the handle (TS uses a WeakMap):
  // segmentIndex -> that segment's graphemes.
  mutable std::unordered_map<int32_t, std::vector<std::u16string>> lineTextCache;
};

using PreparedPtr = std::shared_ptr<Prepared>;

struct LayoutResult {
  int32_t lineCount = 0;
  double height = 0;
};

struct LineStats {
  int32_t lineCount = 0;
  double maxLineWidth = 0;
};

struct LayoutLineRange {
  double width = 0;
  LayoutCursor start;
  LayoutCursor end;
};

struct LayoutLine {
  std::u16string text;
  double width = 0;
  LayoutCursor start;
  LayoutCursor end;
};

struct LayoutLinesResult {
  int32_t lineCount = 0;
  double height = 0;
  std::vector<LayoutLine> lines;
};

struct PrepareOptions {
  WhiteSpaceMode whiteSpace = WhiteSpaceMode::Normal;
  WordBreakMode wordBreak = WordBreakMode::Normal;
  double letterSpacing = 0;
};

// line-break.ts InternalLineVisitor
using InternalLineVisitor = std::function<void(
    double width, int32_t startSegmentIndex, int32_t startGraphemeIndex,
    int32_t endSegmentIndex, int32_t endGraphemeIndex)>;

// --- rich-inline.ts ---

struct RichInlineItem {
  std::u16string text;
  std::u16string font; // canvas font shorthand (UTF-16 to mirror JS keys)
  double letterSpacing = 0;      // TS: letterSpacing ?? 0
  bool breakNever = false;       // TS: break === 'never'
  double extraWidth = 0;         // TS: extraWidth ?? 0
};

struct RichInlineCursor {
  int32_t itemIndex = 0;
  int32_t segmentIndex = 0;
  int32_t graphemeIndex = 0;
};

struct RichInlineFragmentRange {
  int32_t itemIndex = 0;
  double gapBefore = 0;
  double occupiedWidth = 0;
  LayoutCursor start;
  LayoutCursor end;
};

struct RichInlineFragment {
  int32_t itemIndex = 0;
  std::u16string text;
  double gapBefore = 0;
  double occupiedWidth = 0;
  LayoutCursor start;
  LayoutCursor end;
};

struct RichInlineLineRange {
  std::vector<RichInlineFragmentRange> fragments;
  double width = 0;
  RichInlineCursor end;
};

struct RichInlineLine {
  std::vector<RichInlineFragment> fragments;
  double width = 0;
  RichInlineCursor end;
};

struct RichInlineStats {
  int32_t lineCount = 0;
  double maxLineWidth = 0;
};

struct PreparedRichInline; // defined in rich_inline.hpp
using PreparedRichInlinePtr = std::shared_ptr<PreparedRichInline>;

// --- small JS string helpers shared by all modules ---

// JS String.prototype.codePointAt semantics at UTF-16 index i.
inline char32_t codePointAt(const std::u16string& s, size_t i) {
  char16_t c = s[i];
  if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.size()) {
    char16_t d = s[i + 1];
    if (d >= 0xDC00 && d <= 0xDFFF) {
      return (char32_t(c - 0xD800) << 10) + (d - 0xDC00) + 0x10000;
    }
  }
  return c;
}

// Code units consumed by the code point starting at index i (1 or 2).
inline size_t codePointLen(char32_t cp) { return cp > 0xFFFF ? 2 : 1; }

}  // namespace pretext
